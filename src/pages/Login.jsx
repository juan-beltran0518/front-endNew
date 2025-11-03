import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppActions, useAppState } from '../app/state.js';
import { getRouteHash, navigate } from '../app/router.js';
import Modal from '../components/Modal.jsx';
import Loader from '../components/Loader.jsx';
import './Login.css';

function Login({ params = {} }) {
  const { auth } = useAppState();
  const { authStartGoogle, authHandleReturn, authVerifyTotp, authLogout } = useAppActions();
  const [localError, setLocalError] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const hasValidatedRef = useRef(false);

  const searchParams = useMemo(() => new URLSearchParams(params.query || ''), [params?.query]);

  useEffect(() => {
    if (auth.user) {
      navigate(getRouteHash('dashboard'));
    }
  }, [auth.user]);

  useEffect(() => {
    if (auth.mfaRequired) {
      setTotpCode('');
      setTotpError('');
    }
  }, [auth.mfaRequired]);

  useEffect(() => {
    if (auth.user) return;
    const hasDoneParam =
      searchParams.has('done') || searchParams.has('mfa') || searchParams.has('code');
    if (!hasValidatedRef.current || hasDoneParam) {
      hasValidatedRef.current = true;
      authHandleReturn().catch((error) => {
        setLocalError(error?.message || 'No se pudo validar la sesión. Intenta nuevamente.');
      });
    }
  }, [auth.user, authHandleReturn, searchParams]);

  const handleGoogle = async () => {
    setLocalError('');
    try {
      const outcome = await authStartGoogle();
      if (outcome?.mock) {
        authHandleReturn().catch((error) => {
          setLocalError(error?.message || 'No se pudo validar la sesión.');
        });
      }
    } catch (error) {
      setLocalError(error?.message || 'No se pudo iniciar la autenticación con Google.');
    }
  };

  const handleVerifyTotp = async (event) => {
    event.preventDefault();
    if (!auth.mfaTicket || !totpCode.trim()) {
      setTotpError('Introduce el código de 6 dígitos.');
      return;
    }
    try {
      await authVerifyTotp(auth.mfaTicket, totpCode.trim());
      navigate(getRouteHash('dashboard'));
    } catch (error) {
      setTotpError(error?.message || 'Código inválido.');
    }
  };

  const handleTotpInput = (event) => {
    const nextValue = event.target.value.replace(/\D+/g, '').slice(0, 6);
    setTotpCode(nextValue);
    if (totpError) {
      setTotpError('');
    }
  };

  const showLoader = auth.loading && !auth.user;

  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <header>
          <h1 id="login-title">Inicia sesión</h1>
          <p>Utiliza tu cuenta de Google institucional para acceder al IDS.</p>
        </header>
        <div className="login-error" aria-live="polite" role="status">
          {localError || auth.error ? <span>{localError || auth.error}</span> : null}
        </div>
        <button type="button" className="btn primary google-button" onClick={handleGoogle} disabled={showLoader}>
          <span className="google-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M21 12.2273C21 11.5455 20.9364 10.9091 20.8182 10.2727H12V14.0455H16.6364C16.4273 15.2045 15.6909 16.1818 14.5909 16.8636V19.3636H17.6727C19.5455 17.6364 21 15.1818 21 12.2273Z"
                fill="#4285F4"
              />
              <path
                d="M12 21.75C14.7 21.75 16.9545 20.8636 18.5182 19.3636L15.4364 16.8636C14.5909 17.4091 13.4318 17.7727 12 17.7727C9.38182 17.7727 7.16364 16.0455 6.38182 13.6818H3.19092V16.2727C4.74545 19.6818 8.1 21.75 12 21.75Z"
                fill="#34A853"
              />
              <path
                d="M6.38182 13.6818C6.18182 13.1364 6.08182 12.5455 6.08182 11.9545C6.08182 11.3636 6.19091 10.7727 6.38182 10.2273V7.63636H3.19091C2.42727 9.15455 2 10.7818 2 12.5455C2 14.3091 2.42727 15.9364 3.19091 17.4545L6.38182 14.8636C6.18182 14.3182 6.08182 13.7273 6.08182 13.1364L6.38182 13.6818Z"
                fill="#FBBC05"
              />
              <path
                d="M12 6.22727C13.5409 6.22727 14.9 6.75455 15.9636 7.75455L18.6273 5.09091C16.9455 3.54545 14.7 2.63636 12 2.63636C8.1 2.63636 4.74545 4.70455 3.19092 8.11364L6.38182 10.7045C7.16364 8.34091 9.38182 6.22727 12 6.22727Z"
                fill="#EA4335"
              />
            </svg>
          </span>
          {showLoader ? 'Redirigiendo...' : 'Continuar con Google'}
          </button>
        <p className="login-hint">El sistema puede solicitar un código TOTP tras autenticarte con Google.</p>
      </section>

      <Modal
        open={auth.mfaRequired}
        title="Verificación en dos pasos"
        description="Introduce el código de 6 dígitos generado por tu aplicación de autenticación."
        onClose={authLogout}
        actions={
          <>
            <button type="button" className="btn subtle" onClick={authLogout} disabled={auth.loading}>
              Cancelar
            </button>
            <button type="submit" form="totp-form" className="btn primary" disabled={auth.loading}>
              {auth.loading ? 'Verificando...' : 'Verificar'}
            </button>
          </>
        }
      >
        <form id="totp-form" className="totp-form" onSubmit={handleVerifyTotp}>
          <label htmlFor="totp-code">Código TOTP</label>
          <input
            id="totp-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            value={totpCode}
            onChange={handleTotpInput}
            autoComplete="one-time-code"
            placeholder="000000"
            className={totpError ? 'has-error' : ''}
            aria-invalid={totpError ? 'true' : 'false'}
            required
          />
          <p className="totp-hint">El código vence cada 30 segundos.</p>
          {totpError ? (
            <span className="totp-error" role="alert" aria-live="assertive">
              {totpError}
            </span>
          ) : null}
        </form>
      </Modal>
      {auth.loading && !auth.user && !auth.mfaRequired ? (
        <div className="login-overlay" aria-hidden="true">
          <Loader label="Preparando autenticación" />
        </div>
      ) : null}
    </div>
  );
}

export default Login;
