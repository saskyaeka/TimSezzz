import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import InputText from '../components/InputText';
import PrimaryButton from '../components/PrimaryButton';
import { loginSchema } from '../schemas/authSchema';

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data) => {
    // TODO: sambungkan ke API backend di task berikutnya
    console.log('login', data);
  };

  return (
    <main className="auth">
      <div className="box">
        <div className="brand">
          {/* salin <svg> logo dari HTML-mu, ubah stroke-width -> strokeWidth, stroke-linecap -> strokeLinecap */}
          <div><b>PAOLOTORY</b><small>Enterprise</small></div>
        </div>
        <h1>Masuk</h1>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <InputText id="email" label="Email" type="email" autoComplete="username"
            error={errors.email?.message} {...register('email')} />
          <InputText id="pass" label="Kata sandi" type="password" autoComplete="current-password"
            error={errors.password?.message} {...register('password')} />
          <PrimaryButton type="submit" loading={isSubmitting}>Masuk</PrimaryButton>
        </form>
        <div className="foot">
          <span>Belum punya akun? <Link className="link" to="/register">Daftar</Link></span>
        </div>
      </div>
    </main>
  );
}