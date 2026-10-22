
import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function ProtectedRoute({ token, user, allowedRole }) {
  const location = useLocation();

  if (!token || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to="/predict" replace />;
  }

  return <Outlet />;
}
