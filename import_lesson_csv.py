#!/usr/bin/env python3
"""
导入课程CSV数据到Directus
Usage: python3 import_lesson_csv.py <csv_file> [lesson_id]
"""

import sys
import json
import requests
import csv
import re
from urllib.parse import urljoin

DIRECTUS_URL = "http://localhost:8055"
EMAIL = "admin@course-platform.com"
PASSWORD = "ExpertAdmin2026@Directus"

def get_token():
    """登录获取token"""
    resp = requests.post(
        f"{DIRECTUS_URL}/auth/login",
        json={"email": EMAIL, "password": PASSWORD}
    )
    data = resp.json()
    return data["data"]["access_token"]

def get_lesson_modules(lesson_id, token):
    """获取课时的5个模块"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(
        f"{DIRECTUS_URL}/items/lesson_modules",
        headers=headers,
        params={
            "filter[lesson_id][_eq]": lesson_id,
            "sort": "module_index",
            "fields": "id,module_index,module_type"
        }
    )
    data = resp.json()
    return {m["module_type"]: m["id"] for m in data["data"]}

def update_module(module_id, data, token):
    """更新模块数据"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.patch(
        f"{DIRECTUS_URL}/items/lesson_modules/{module_id}",
        headers=headers,
        json=data
    )
    return resp.status_code == 200

def parse_duration(duration_str):
    """从字符串提取分钟数，如 '（5分钟）' -> 5"""
    match = re.search(r'(\d+)分钟', duration_str)
    return int(match.group(1)) if match else 0

def update_lesson_title(lesson_id, title, token):
    """更新课时标题"""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.patch(
        f"{DIRECTUS_URL}/items/lessons/{lesson_id}",
        headers=headers,
        json={"title": title, "description": title}
    )
    return resp.status_code == 200

def create_module_item(module_id, module_index, row, token):
    """为模块创建一个课件项"""
    headers = {"Authorization": f"Bearer {token}"}
    headers["Content-Type"] = "application/json"

    # 从教学环节提取名称
    teaching_module = row.get("教学环节", "")
    # 提取名称（去掉时长）："一、情境导入（5分钟）" -> "一、情境导入"
    module_name = re.sub(r'[（(].*?分钟.*?[）)]', '', teaching_module).strip()

    # 解析计划列，提取资源信息
    plan = row.get("计划", "")

    data = {
        "module_id": module_id,
        "item_type": "interactive",  # 互动内容
        "title": module_name,
        "teacher_activity": row.get("教师活动", ""),
        "student_activity": row.get("学生活动", ""),
        "design_intent": row.get("设计意图", ""),
        "curriculum_standards": row.get("课标对应", ""),
        "plan": plan,
        "duration_minutes": parse_duration(teaching_module),
        "duration": parse_duration(teaching_module) * 60,
        "sort_order": module_index
    }

    resp = requests.post(
        f"{DIRECTUS_URL}/items/module_items",
        headers=headers,
        json=data
    )
    return resp.status_code in (200, 201)

def import_csv(csv_file, lesson_id):
    """导入CSV文件"""
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 读取CSV（尝试UTF-8，如果失败则用GB2312）
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
    except UnicodeDecodeError:
        with open(csv_file, 'r', encoding='gb2312') as f:
            reader = csv.DictReader(f)
            rows = list(reader)

    # 过滤有效的教学环节行（跳过空白行和板书设计行）
    valid_rows = []
    for row in rows:
        teaching_module = row.get("教学环节", "").strip()
        # 跳过空白行或包含"板书设计"的行
        if not teaching_module or "板书设计" in teaching_module:
            continue
        # 跳过只有5列的无效行
        if len([v for v in row.values() if v and v.strip()]) < 5:
            continue
        valid_rows.append(row)

    print(f"找到 {len(valid_rows)} 个有效教学环节")

    # 获取模块映射 (module_type -> module_id)
    # module_type: 情景导入, 探索发现, 游戏体验, 拓展延伸, 课程小结
    type_mapping = {
        "情境导入": "情景导入",
        "探索发现": "探索发现",
        "游戏体验": "游戏体验",
        "拓展延伸": "拓展延伸",
        "课堂小结": "课程小结"
    }

    modules = get_lesson_modules(lesson_id, token)
    print(f"课时的模块: {modules}")

    # 更新每个模块
    for i, row in enumerate(valid_rows):
        teaching_module = row.get("教学环节", "").strip()

        # 确定module_type
        module_type = None
        for key, value in type_mapping.items():
            if key in teaching_module:
                module_type = value
                break

        if not module_type:
            print(f"  跳过: {teaching_module}")
            continue

        module_id = modules.get(module_type)
        if not module_id:
            print(f"  找不到模块: {module_type}")
            continue

        # 提取课时名称（从第一行）
        if i == 0:
            # 从教学环节提取完整标题
            match = re.search(r'曾侯乙[^\n。，]+', teaching_module)
            if match:
                lesson_title = match.group(0)
            else:
                lesson_title = "曾侯乙编钟——听辨音的高低"
            update_lesson_title(lesson_id, lesson_title, token)
            print(f"更新课时标题: {lesson_title}")

        # 创建课件项
        success = create_module_item(module_id, i + 1, row, token)
        print(f"  [{i+1}] {module_type} -> {teaching_module[:30]}... : {'OK' if success else 'FAILED'}")

    print("\n导入完成!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 import_lesson_csv.py <csv_file> [lesson_id]")
        sys.exit(1)

    csv_file = sys.argv[1]
    lesson_id = int(sys.argv[2]) if len(sys.argv) > 2 else 120

    import_csv(csv_file, lesson_id)