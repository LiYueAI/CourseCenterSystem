import RegisterForm from '@/components/RegisterForm';

export default function TeacherRegisterPage() {
  return (
    <RegisterForm
      role="teacher"
      roleLabel="教师端"
      roleDescription=""
      compact
    />
  );
}
