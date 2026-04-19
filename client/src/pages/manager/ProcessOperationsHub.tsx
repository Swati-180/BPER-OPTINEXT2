import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Workflow, LayoutGrid, ShieldCheck } from 'lucide-react';
import ProcessManagementPage from './ProcessManagementPage';
import TaxonomyManagement from './TaxonomyManagement';
import AuditLogs from './AuditLogs';

type ProcessOpsTab = 'process' | 'taxonomy' | 'audit';

const TABS: Array<{
  key: ProcessOpsTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: 'process',
    label: 'Process Management',
    description: 'Browse towers, processes, and activities, and manage custom process entries.',
    icon: Workflow,
  },
  {
    key: 'taxonomy',
    label: 'Taxonomy',
    description: 'Maintain the master hierarchy for major process, grouping, and sub-processes.',
    icon: LayoutGrid,
  },
  {
    key: 'audit',
    label: 'Audit Trail',
    description: 'Review historical records of platform actions and administrative changes.',
    icon: ShieldCheck,
  },
];

function getValidTab(value: string | null): ProcessOpsTab {
  if (value === 'taxonomy') return 'taxonomy';
  if (value === 'audit') return 'audit';
  return 'process';
}

export default function ProcessOperationsHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getValidTab(searchParams.get('tab'));
  const [mountedTabs, setMountedTabs] = useState<Record<ProcessOpsTab, boolean>>({
    process: true,
    taxonomy: false,
    audit: false,
  });

  useEffect(() => {
    setMountedTabs((prev) =>
      prev[activeTab]
        ? prev
        : {
            ...prev,
            [activeTab]: true,
          }
    );
  }, [activeTab]);

  const tabMeta = useMemo(() => {
    return TABS.find((tab) => tab.key === activeTab) || TABS[0];
  }, [activeTab]);

  return (
    <div className="app-stable-panel space-y-5 animate-in fade-in duration-500">
      <section className="rounded-2xl border border-[#D9E4F2] bg-white p-4 shadow-[0_5px_14px_rgba(16,42,80,0.06)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2649]">Process Operations</h1>
            <p className="text-sm text-[#647D9D]">One place for process management, taxonomy, and audit visibility.</p>
          </div>
          <div className="rounded-xl bg-[#F6FAFF] p-1.5 inline-flex gap-1.5">
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSearchParams({ tab: tab.key })}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[#1A5BA7] text-white shadow-sm'
                      : 'text-[#5D789A] hover:bg-white hover:text-[#1A5BA7]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold text-[#7A90AD]">{tabMeta.description}</p>
      </section>

      {mountedTabs.process && (
        <div className={`app-stable-panel ${activeTab === 'process' ? 'block' : 'hidden'}`}>
          <ProcessManagementPage />
        </div>
      )}
      {mountedTabs.taxonomy && (
        <div className={`app-stable-panel ${activeTab === 'taxonomy' ? 'block' : 'hidden'}`}>
          <TaxonomyManagement />
        </div>
      )}
      {mountedTabs.audit && (
        <div className={`app-stable-panel ${activeTab === 'audit' ? 'block' : 'hidden'}`}>
          <AuditLogs />
        </div>
      )}
    </div>
  );
}
