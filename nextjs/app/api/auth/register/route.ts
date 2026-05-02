import { NextRequest, NextResponse } from 'next/server';
import {
  consumePhoneVerificationCode,
  createToken,
  findUserByPhone,
  registerUser,
  sendPhoneVerificationCode,
  setAuthCookie,
} from '@/lib/auth';
import { getTeacherCurrentClassroomSummary } from '@/lib/school-classroom';

const WECHAT_PLACEHOLDER_ERROR = '微信注册暂未接入，请先使用手机号注册';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const provider = String(
      body.provider || body.auth_provider || body.authProvider || body.method || ''
    ).toLowerCase();
    const action = String(body.action || '').toLowerCase();

    if (provider === 'wechat') {
      return NextResponse.json(
        { error: WECHAT_PLACEHOLDER_ERROR, code: 'WECHAT_NOT_IMPLEMENTED' },
        { status: 501 }
      );
    }

    if (action === 'send_code') {
      const phone = body.phone;

      if (!phone) {
        return NextResponse.json(
          { error: '请输入手机号' },
          { status: 400 }
        );
      }

      const existingUser = await findUserByPhone(phone);
      if (existingUser) {
        return NextResponse.json(
          { error: '手机号已注册' },
          { status: 409 }
        );
      }

      const verification = await sendPhoneVerificationCode({
        phone,
        scene: 'register',
      });

      return NextResponse.json({
        success: true,
        message: '验证码已发送',
        verification: {
          phone: verification.phone,
          scene: verification.scene,
          provider: verification.provider,
          expires_at: verification.expiresAt,
          debug_code: verification.debugCode,
        },
      });
    }

    const {
      phone,
      email,
      password,
      code,
      role,
      name,
      school,
      subject,
      class_name,
      grade_level,
      class_code,
    } = body;

    if (!phone || !password || !role || !name) {
      return NextResponse.json(
        { error: '请填写手机号、密码和姓名' },
        { status: 400 }
      );
    }

    // Public self-registration must not mint admin accounts.
    if (!['teacher', 'student'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { error: '密码至少需要 6 位' },
        { status: 400 }
      );
    }

    if (role === 'teacher') {
      if (
        !school ||
        !subject ||
        !grade_level ||
        !class_name
      ) {
        return NextResponse.json(
          { error: '请完整填写学校、学科、年级和班级' },
          { status: 400 }
        );
      }
    } else if (role === 'student' && !class_code) {
      return NextResponse.json(
        { error: '请填写班级编码' },
        { status: 400 }
      );
    }

    const existingUser = await findUserByPhone(phone);
    if (existingUser) {
      return NextResponse.json(
        { error: '手机号已注册' },
        { status: 409 }
      );
    }

    if (code) {
      const verified = await consumePhoneVerificationCode({
        phone,
        code,
        scene: 'register',
      });

      if (!verified) {
        return NextResponse.json(
          { error: '验证码错误或已过期' },
          { status: 400 }
        );
      }
    }

    const user = await registerUser({
      phone,
      email,
      password,
      role,
      name,
      school,
      subject,
      class_name,
      grade_level,
      class_code,
    });

    // Auto-login after registration
    const token = await createToken(user);
    await setAuthCookie(token);

    const classroom =
      role === 'teacher' ? await getTeacherCurrentClassroomSummary(user.id) : null;

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        name: user.name,
      },
      classroom: classroom
        ? {
            id: classroom.id,
            classCode: classroom.classCode,
            schoolName: classroom.schoolName,
            gradeLevel: classroom.gradeLevel,
            className: classroom.className,
          }
        : null,
    }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Invalid phone format') {
      return NextResponse.json(
        { error: '手机号格式不正确' },
        { status: 400 }
      );
    }
    if (error.message === 'Verification code requested too frequently') {
      return NextResponse.json(
        { error: '验证码发送过于频繁，请稍后再试' },
        { status: 429 }
      );
    }
    if (error.message === 'Phone already exists') {
      return NextResponse.json(
        { error: '手机号已注册' },
        { status: 409 }
      );
    }
    if (error.message === 'Email already exists') {
      return NextResponse.json(
        { error: '邮箱已被使用' },
        { status: 409 }
      );
    }
    if (
      error.message === 'Teacher classroom info is required' ||
      error.message === 'Student classroom info or class code is required'
    ) {
      return NextResponse.json(
        { error: '请完整填写班级信息' },
        { status: 400 }
      );
    }
    if (error.message === 'Classroom code not found') {
      return NextResponse.json(
        { error: '班级编码不存在，请向老师确认后再试' },
        { status: 400 }
      );
    }
    if (error.message === 'Invalid classroom code format') {
      return NextResponse.json(
        { error: '班级编码需为 16 位，仅支持大写字母和数字，且不含 0、1、4、I、O' },
        { status: 400 }
      );
    }

    console.error('Register error:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
