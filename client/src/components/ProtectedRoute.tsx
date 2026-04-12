import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  user: any;
  allowedRole?: string;
}

export default function ProtectedRoute({ children, user, allowedRole }: ProtectedRouteProps) {
  const location = useLocation();

  if (!user) {
    // Redirect to login if not authenticated
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    // Redirect to unauthorized if role doesn't match
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
