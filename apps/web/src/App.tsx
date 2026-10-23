import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { AdminBookings } from './pages/admin/AdminBookings';
import { Availability } from './pages/admin/Availability';
import { Overview } from './pages/admin/Overview';
import { Services } from './pages/admin/Services';
import { AuthPage } from './pages/AuthPage';
import { Landing } from './pages/Landing';
import { Privacy, Terms } from './pages/Legal';
import { NotFound } from './pages/NotFound';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import { AiCoach } from './pages/user/ai/AiCoach';
import { RunPage } from './pages/user/ai/RunPage';
import { JobPage } from './pages/user/jobs/JobPage';
import { Jobs } from './pages/user/jobs/Jobs';
import { Sessions, SessionsRedirect } from './pages/user/Sessions';
import { UserHome } from './pages/user/UserHome';

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="signup" element={<AuthPage mode="signup" />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route
        path="app"
        element={
          <ProtectedRoute role="user">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<UserHome />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:jobId" element={<JobPage />} />
        <Route path="ai" element={<AiCoach />} />
        <Route path="ai/:runId" element={<RunPage />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="book" element={<SessionsRedirect tab="book" />} />
        <Route path="bookings" element={<SessionsRedirect />} />
      </Route>

      <Route
        path="admin"
        element={
          <ProtectedRoute role="admin">
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="slots" element={<Availability />} />
        <Route path="services" element={<Services />} />
      </Route>
    </Routes>
  );
}
