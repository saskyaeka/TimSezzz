import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import InputText from '../components/InputText';
import PrimaryButton from '../components/PrimaryButton';
import { registerSchema } from '../schemas/authSchema';
import { authService } from '../api/authService';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data) => {
  setServerError('');
  try {
    await authService.register({
      name: data.name,
      email: data.email,
      password: data.password,
    });

    alert('Registrasi berhasil! Silakan masuk.');
    navigate('/login');
  } catch (err) {
    setServerError(err.message);
  }
};

  return (
    <main className="auth">
      <div className="box">
        <div className="brand">
          <div>
            <b>PAOLOTORY</b>
            <small>Enterprise</small>
          </div>
        </div>
        <h1>Daftar</h1>

        {serverError && (
          <div
            style={{
              padding: '10px',
              marginBottom: '15px',
              backgroundColor: '#ffebee',
              color: '#c62828',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <InputText
            id="name"
            label="Nama lengkap"
            autoComplete="name"
            error={errors.name?.message}
            {...register('name')}
          />
          <InputText
            id="email"
            label="Email"
            type="email"
            autoComplete="username"
            error={errors.email?.message}
            {...register('email')}
          />
          <InputText
            id="pass"
            label="Kata sandi"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <InputText
            id="confirm"
            label="Konfirmasi kata sandi"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <PrimaryButton type="submit" loading={isSubmitting}>
            Daftar
          </PrimaryButton>
        </form>
        <div className="foot">
          <span>
            Sudah punya akun?{' '}
            <Link className="link" to="/login">
              Masuk
            </Link>
          </span>
        </div>
      </div>
    </main>
  );
}