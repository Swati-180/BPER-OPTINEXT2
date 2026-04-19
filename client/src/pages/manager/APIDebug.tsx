import { useEffect, useState } from 'react';

export default function APIDebugPage() {
  const [status, setStatus] = useState<string>('Testing...');
  const [towers, setTowers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const test = async () => {
      try {
        const token = localStorage.getItem('bper.auth.token');
        console.log('Token:', token ? 'Present' : 'Missing');
        
        if (!token) {
          setError('No auth token found in localStorage');
          return;
        }

        setStatus('Fetching towers...');
        
        const response = await fetch('http://localhost:5000/api/activities/towers/All', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);

        if (!response.ok) {
          const errText = await response.text();
          console.error('Error response:', errText);
          setError(`HTTP ${response.status}: ${errText}`);
          return;
        }

        const data = await response.json();
        console.log('Towers data:', data);
        
        setTowers(data);
        setStatus(`Success! Received ${data.length} towers`);
      } catch (err: any) {
        console.error('Test error:', err);
        setError(err?.message || 'Unknown error');
        setStatus('Error');
      }
    };

    test();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">API Debug</h1>
      <div className="mb-4">
        <p className="font-semibold">Status: <span className="text-blue-600">{status}</span></p>
        {error && <p className="text-red-600">Error: {error}</p>}
      </div>
      <div>
        <h2 className="font-semibold mb-2">Towers ({towers.length}):</h2>
        <ul className="space-y-1">
          {towers.slice(0, 10).map((t: any) => (
            <li key={t.name} className="text-sm">- {t.name} ({t.processCount} processes)</li>
          ))}
        </ul>
        {towers.length > 10 && <p className="text-sm text-gray-500">... and {towers.length - 10} more</p>}
      </div>
    </div>
  );
}
