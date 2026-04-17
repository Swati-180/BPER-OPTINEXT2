import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  user: any;
  allowedRole?: string;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, user, allowedRole, allowedRoles }: ProtectedRouteProps) {
  const location = useLocation();

  if (!user) {
    // Redirect to login if not authenticated
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  const hasSingleRoleAccess = allowedRole ? user.role === allowedRole : true;
  const hasMultiRoleAccess = allowedRoles && allowedRoles.length > 0 ? allowedRoles.includes(user.role) : true;

  if (!hasSingleRoleAccess || !hasMultiRoleAccess) {
    // Redirect to unauthorized if role doesn't match
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
