import { Suspense, lazy } from 'react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { PwaBootstrap } from '@/components/PwaBootstrap';
import { AuthGate, AuthProvider } from '@/lib/auth/client';
import { SurveyProvider } from '@/lib/survey-context';
import SurveyLayout from '@/pages/survey/layout';
import { ErrorBoundary } from './ErrorBoundary';

// Lazy routes (v1's App Router pages, one chunk each). The service worker precaches them all,
// so every page opens offline after the first visit (FR-OFF-1).
const Home = lazy(() => import('@/pages/page'));
const SignIn = lazy(() => import('@/pages/signin/page'));
const SignUp = lazy(() => import('@/pages/signup/page'));
const ChangePassword = lazy(() => import('@/pages/change-password/page'));
const Privacy = lazy(() => import('@/pages/privacy/page'));
const Terms = lazy(() => import('@/pages/terms/page'));
const Dashboard = lazy(() => import('@/pages/dashboard/page'));
const Admin = lazy(() => import('@/pages/admin/page'));
const FindSchool = lazy(() => import('@/pages/survey/find-school/page'));
const Details = lazy(() => import('@/pages/survey/details/page'));
const Levels = lazy(() => import('@/pages/survey/levels/page'));
const Resume = lazy(() => import('@/pages/survey/resume/page'));
const Locations = lazy(() => import('@/pages/survey/locations/page'));
const Location = lazy(() => import('@/pages/survey/locations/location/page'));
const LocationName = lazy(() => import('@/pages/survey/locations/location/name/page'));
const Classroom = lazy(() => import('@/pages/survey/locations/location/classroom/page'));
const Category = lazy(() => import('@/pages/survey/locations/category/page'));
const Review = lazy(() => import('@/pages/survey/review/page'));
const Done = lazy(() => import('@/pages/survey/done/page'));

/**
 * Provider order as in v1's root layout: SurveyProvider sits outside AuthGate so a session
 * lapsing mid-survey swaps the screen for sign-in without unmounting the survey (or its autosave).
 */
export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <PwaBootstrap />
        <AuthProvider>
          <SurveyProvider>
            <AuthGate>
              <Suspense fallback={null}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/signin" element={<SignIn />} />
                  <Route path="/signup" element={<SignUp />} />
                  <Route path="/change-password" element={<ChangePassword />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route
                    path="/survey"
                    element={
                      <SurveyLayout>
                        <Outlet />
                      </SurveyLayout>
                    }
                  >
                    <Route path="find-school" element={<FindSchool />} />
                    <Route path="details" element={<Details />} />
                    <Route path="levels" element={<Levels />} />
                    <Route path="resume" element={<Resume />} />
                    <Route path="locations" element={<Locations />} />
                    <Route path="locations/location" element={<Location />} />
                    <Route path="locations/location/name" element={<LocationName />} />
                    <Route path="locations/location/classroom" element={<Classroom />} />
                    <Route path="locations/category" element={<Category />} />
                    <Route path="review" element={<Review />} />
                    <Route path="done" element={<Done />} />
                  </Route>
                  <Route path="*" element={<Home />} />
                </Routes>
              </Suspense>
            </AuthGate>
          </SurveyProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
