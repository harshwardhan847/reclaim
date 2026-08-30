import React from 'react';
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Cpu, MemoryStick, Monitor, RefreshCw, Loader2 } from "lucide-react";

type DiskInfo = {
  name: string;
  mount_point: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  fs_type: string;
  is_removable: boolean;
};

type SystemInfo = {
  disks: DiskInfo[];
  total_ram: number;
  used_ram: number;
  cpu_name: string;
  cpu_cores: number;
  os_name: string;
  os_version: string;
  hostname: string;
  uptime: number;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  return `${days} days, ${hours} hours`;
};

const CircularProgress = ({ percent, size = 80, stroke = 6 }: { percent: number, size?: number, stroke?: number }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} fill="none" />
      <circle 
        cx={size/2} 
        cy={size/2} 
        r={radius} 
        stroke={percent > 80 ? '#ef4444' : percent > 60 ? '#f59e0b' : '#22c55e'} 
        strokeWidth={stroke} 
        fill="none" 
        strokeDasharray={circumference} 
        strokeDashoffset={offset} 
        strokeLinecap="round" 
        className="transition-all duration-700" 
      />
    </svg>
  );
};

function SystemInfoView() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const data = await invoke<SystemInfo>('get_system_info');
      setInfo(data);
    } catch (error) {
      console.error("Failed to fetch system info", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  if (loading && !info) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (!info) return <div className="text-white/50 p-4">Could not load system information.</div>;

  const ramPercent = (info.used_ram / info.total_ram) * 100;
  const ramColor = ramPercent > 80 ? 'bg-red-500' : ramPercent > 60 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Monitor className="w-5 h-5" /> System Dashboard
        </h2>
        <button 
          onClick={fetchInfo} 
          disabled={loading}
          className="p-2 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Memory Card */}
        <div className="glass rounded-xl border border-white/10 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/5 rounded-lg">
              <MemoryStick className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Memory</h3>
              <p className="text-white/50 text-sm">System RAM usage</p>
            </div>
          </div>
          
          <div className="mt-2">
            <div className="flex justify-between text-sm mb-2 text-white/80">
              <span>{formatBytes(info.used_ram)} used</span>
              <span>{formatBytes(info.total_ram)} total</span>
            </div>
            <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full ${ramColor} transition-all duration-700`}
                style={{ width: `${Math.min(100, ramPercent)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Processor Card */}
        <div className="glass rounded-xl border border-white/10 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/5 rounded-lg">
              <Cpu className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Processor</h3>
              <p className="text-white/50 text-sm">{info.cpu_cores} Cores</p>
            </div>
          </div>
          
          <div className="mt-2 text-white/80">
            <p className="font-medium">{info.cpu_name}</p>
          </div>
        </div>

        {/* Disk Storage Card */}
        <div className="glass rounded-xl border border-white/10 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/5 rounded-lg">
              <HardDrive className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Disk Storage</h3>
              <p className="text-white/50 text-sm">Local drives</p>
            </div>
          </div>
          
          <div className="flex flex-col gap-4 mt-2">
            {info.disks.map((disk, idx) => {
              const usedPercent = (disk.used_bytes / disk.total_bytes) * 100;
              return (
                <div key={idx} className="flex items-center gap-4 bg-white/5 p-3 rounded-lg border border-white/5">
                  <div className="relative flex items-center justify-center shrink-0">
                    <CircularProgress percent={usedPercent} size={60} stroke={4} />
                    <span className="absolute text-xs text-white/80 font-medium">{Math.round(usedPercent)}%</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">{disk.name || disk.mount_point}</span>
                      {disk.is_removable && (
                        <span className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full">USB</span>
                      )}
                    </div>
                    <p className="text-white/50 text-xs truncate mb-1">
                      {disk.mount_point} • {disk.fs_type}
                    </p>
                    <p className="text-white/70 text-sm">
                      {formatBytes(disk.used_bytes)} / {formatBytes(disk.total_bytes)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Card */}
        <div className="glass rounded-xl border border-white/10 p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3 text-white">
            <div className="p-2 bg-white/5 rounded-lg">
              <Monitor className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">System</h3>
              <p className="text-white/50 text-sm">Host information</p>
            </div>
          </div>
          
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider mb-1">OS</p>
              <p className="text-white">{info.os_name} {info.os_version}</p>
            </div>
            <div>
              <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Hostname</p>
              <p className="text-white truncate">{info.hostname}</p>
            </div>
            <div className="col-span-2 mt-2">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Uptime</p>
              <p className="text-white">{formatUptime(info.uptime)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SystemInfoViewMemo = React.memo(SystemInfoView);
export { SystemInfoViewMemo as SystemInfoView };
