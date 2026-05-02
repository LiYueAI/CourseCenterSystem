import { NextRequest, NextResponse } from 'next/server';
import {
  createToken,
  findUserByPhone,
  loginUser,
  loginUserWithPhoneCode,
  sendPhoneVerificationCode,
  setAuthCookie,
} from '@/lib/auth';

const WECHAT_PLACEHOLDER_ERROR = '微信登录暂未接入，请先使用手机号或邮箱登录';

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
      const phone = body.phone || body.identifier;

      if (!phone) {
        return NextResponse.json(
          { error: '请输入手机号' },
          { status: 400 }
        );
      }

      const existingUser = await findUserByPhone(phone);
      if (!existingUser || existingUser.role === 'admin' || !existingUser.is_active) {
        return NextResponse.json(
          { error: '该手机号暂未开通登录' },
          { status: 404 }
        );
      }

      const verification = await sendPhoneVerificationCode({
        phone,
        scene: 'login',
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

    if (body.phone && body.code) {
      const user = await loginUserWithPhoneCode(body.phone, body.code);

      if (!user) {
        return NextResponse.json(
          { error: '手机号或验证码错误' },
          { status: 401 }
        );
      }

      const token = await createToken(user);
      await setAuthCookie(token);

      return NextResponse.json({
        success: true,
        login_method: 'phone_code',
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          role: user.role,
          name: user.name,
        },
      });
    }

    const identifier = body.identifier || body.email || body.phone;
    const password = body.password;

    if (!identifier || !password) {
      return NextResponse.json(
        { error: '请输入手机号或邮箱，以及密码' },
        { status: 400 }
      );
    }

    const user = await loginUser(identifier, password);

    if (!user) {
      return NextResponse.json(
        { error: '手机号、邮箱或密码错误' },
        { status: 401 }
      );
    }

    const token = await createToken(user);
    await setAuthCookie(token);

    return NextResponse.json({
      success: true,
      login_method: 'password',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        name: user.name,
      },
    });
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

    console.error('Login error:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
