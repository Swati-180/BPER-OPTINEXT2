export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 min-h-[400px] flex items-center justify-center text-gray-400 italic">
        {title} interface will be implemented here.
      </div>
    </div>
  );
}
