import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import InputText from '../components/InputText';
import PrimaryButton from '../components/PrimaryButton';
import { loginSchema } from '../schemas/authSchema';
import authService from '../api/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data) => {
    setServerError('');
    try {
      const result = await authService.login({
        email: data.email,
        password: data.password,
      });

      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));

      navigate('/dashboard');
    } catch (err) {
      setServerError(err.message);
    }
  };

  return (
    <main className="auth">
      <div className="box">
        <div className="brand">
          <div><b>PAOLOTORY</b><small>Enterprise</small></div>
        </div>
        <h1>Masuk</h1>

        {serverError && (
          <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '6px', fontSize: '14px' }}>
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
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
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <PrimaryButton type="submit" loading={isSubmitting}>Masuk</PrimaryButton>
        </form>

        <div className="foot">
          <span>Belum punya akun? <Link className="link" to="/register">Daftar</Link></span>
        </div>
      </div>
    </main>
  );
}
