import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Unauthorized() {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#165BAA]/5 p-4 text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <ShieldAlert className="w-10 h-10 text-red-600" />
      </div>
      <h1 className="text-4xl font-bold text-gray-900 mb-2">Access Denied</h1>
      <p className="text-gray-600 mb-8 max-w-md">
        You do not have permission to view this page. Please ensure you are logged in with the correct credentials.
      </p>
      <Button asChild className="bg-[#165BAA] hover:bg-[#124a8a]">
        <Link to="/">Back to Login</Link>
      </Button>
    </div>
  );
}
