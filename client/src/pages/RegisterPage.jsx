import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import InputText from '../components/InputText';
import PrimaryButton from '../components/PrimaryButton';
import { registerSchema } from '../schemas/authSchema';

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data) => {
    // TODO: sambungkan ke API backend di task berikutnya
    console.log('register', data);
  };

  return (
    <main className="auth">
      <div className="box">
        <div className="brand">
          <div><b>PAOLOTORY</b><small>Enterprise</small></div>
        </div>
        <h1>Daftar</h1>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <InputText id="name" label="Nama lengkap" autoComplete="name"
            error={errors.name?.message} {...register('name')} />
          <InputText id="email" label="Email" type="email" autoComplete="username"
            error={errors.email?.message} {...register('email')} />
          <InputText id="pass" label="Kata sandi" type="password" autoComplete="new-password"
            error={errors.password?.message} {...register('password')} />
          <InputText id="confirm" label="Konfirmasi kata sandi" type="password" autoComplete="new-password"
            error={errors.confirmPassword?.message} {...register('confirmPassword')} />
          <PrimaryButton type="submit" loading={isSubmitting}>Daftar</PrimaryButton>
        </form>
        <div className="foot">
          <span>Sudah punya akun? <Link className="link" to="/login">Masuk</Link></span>
        </div>
      </div>
    </main>
  );
}