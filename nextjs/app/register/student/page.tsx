import RegisterForm from '@/components/RegisterForm';

export default function StudentRegisterPage() {
  return (
    <RegisterForm
      role="student"
      roleLabel="学生端"
      roleDescription="先填手机号，再填班级编码。"
    />
  );
}
