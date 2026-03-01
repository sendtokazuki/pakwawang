import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Thermometer, 
  Droplets, 
  Heart, 
  Plus, 
  History, 
  TrendingUp, 
  Trash2, 
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Clock,
  Pill,
  Filter,
  User,
  Users
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { format, parseISO, isWithinInterval, subHours, subDays, subWeeks, subMonths, startOfDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { HealthRecord } from './types';

type TimeFilter = 'all' | 'hour' | 'day' | 'week' | 'month';

const MetricCard = ({ 
  title, 
  value, 
  unit, 
  icon: Icon, 
  color, 
  status 
}: { 
  title: string; 
  value: string | number | null; 
  unit: string; 
  icon: any; 
  color: string;
  status?: 'normal' | 'warning' | 'danger'
}) => (
  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <div className={cn("p-2 rounded-xl", color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      {status && (
        <div className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
          status === 'normal' ? "bg-emerald-100 text-emerald-700" :
          status === 'warning' ? "bg-amber-100 text-amber-700" :
          "bg-rose-100 text-rose-700"
        )}>
          {status}
        </div>
      )}
    </div>
    <div>
      <p className="text-slate-500 text-xs font-medium">{title}</p>
      <div className="flex items-baseline gap-1">
        <h3 className="text-2xl font-bold text-slate-900">{value ?? '--'}</h3>
        <span className="text-slate-400 text-sm">{unit}</span>
      </div>
    </div>
  </div>
);

export default function App() {
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [caregiverName, setCaregiverName] = useState(localStorage.getItem('caregiver_name') || '');
  const [showSyncInfo, setShowSyncInfo] = useState(false);
  const [formData, setFormData] = useState({
    spo2: '',
    pulse: '',
    temperature: '',
    systolic: '',
    diastolic: '',
    blood_sugar: '',
    medications: '',
    notes: '',
    timestamp: format(new Date(), "yyyy-MM-dd'T'HH:mm")
  });

  useEffect(() => {
    fetchRecords();

    // WebSocket setup for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'RECORD_ADDED' || data.type === 'RECORD_DELETED') {
        fetchRecords();
      }
    };

    return () => ws.close();
  }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch('/api/records');
      if (!res.ok) throw new Error('Gagal mengambil data');
      const data = await res.json();
      setRecords(data);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil data terbaru. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const now = new Date();
    if (timeFilter === 'all') return records;
    
    return records.filter(record => {
      const recordDate = parseISO(record.timestamp);
      if (timeFilter === 'hour') return isWithinInterval(recordDate, { start: subHours(now, 1), end: now });
      if (timeFilter === 'day') return isWithinInterval(recordDate, { start: startOfDay(now), end: now });
      if (timeFilter === 'week') return isWithinInterval(recordDate, { start: subWeeks(now, 1), end: now });
      if (timeFilter === 'month') return isWithinInterval(recordDate, { start: subMonths(now, 1), end: now });
      return true;
    });
  }, [records, timeFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caregiverName) {
      alert('Mohon isi nama Anda terlebih dahulu');
      return;
    }
    
    localStorage.setItem('caregiver_name', caregiverName);

    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spo2: formData.spo2 ? parseInt(formData.spo2) : null,
          pulse: formData.pulse ? parseInt(formData.pulse) : null,
          temperature: formData.temperature ? parseFloat(formData.temperature) : null,
          systolic: formData.systolic ? parseInt(formData.systolic) : null,
          diastolic: formData.diastolic ? parseInt(formData.diastolic) : null,
          blood_sugar: formData.blood_sugar ? parseInt(formData.blood_sugar) : null,
          medications: formData.medications,
          caregiver_name: caregiverName,
          notes: formData.notes,
          timestamp: formData.timestamp ? new Date(formData.timestamp).toISOString() : null
        })
      });
      if (res.ok) {
        setFormData({
          spo2: '',
          pulse: '',
          temperature: '',
          systolic: '',
          diastolic: '',
          blood_sugar: '',
          medications: '',
          notes: '',
          timestamp: format(new Date(), "yyyy-MM-dd'T'HH:mm")
        });
        setShowForm(false);
        fetchRecords();
      } else {
        const errorData = await res.json();
        alert(`Gagal menyimpan: ${errorData.error || 'Terjadi kesalahan'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menyimpan data.');
    }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Hapus catatan ini?')) return;
    try {
      await fetch(`/api/records/${id}`, { method: 'DELETE' });
      fetchRecords();
    } catch (err) {
      console.error(err);
    }
  };

  const latest = records[0];
  const isSyncConfigured = Boolean(import.meta.env.VITE_GAS_WEB_APP_URL);
  const chartData = [...records].reverse().slice(-10).map(r => ({
    time: format(parseISO(r.timestamp), 'dd/MM HH:mm'),
    spo2: r.spo2,
    pulse: r.pulse,
    temp: r.temperature,
    sys: r.systolic,
    dia: r.diastolic,
    sugar: r.blood_sugar
  }));

  const getStatus = (metric: string, value: number | null) => {
    if (value === null) return undefined;
    if (metric === 'spo2') {
      if (value >= 95) return 'normal';
      if (value >= 92) return 'warning';
      return 'danger';
    }
    if (metric === 'temp') {
      if (value >= 36 && value <= 37.5) return 'normal';
      if (value > 37.5 && value <= 38.5) return 'warning';
      return 'danger';
    }
    if (metric === 'sugar') {
      if (value < 140) return 'normal';
      if (value < 200) return 'warning';
      return 'danger';
    }
    return 'normal';
  };

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 px-4 pt-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-200">
            B
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Kesehatan Bapak</h1>
            <p className="text-slate-500 text-xs">Cloud Database (Google Sheets)</p>
          </div>
        </div>
        <div className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
          <Users className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Online</span>
        </div>
      </header>

      {/* Google Sheets Sync Indicator */}
      <div 
        onClick={() => setShowSyncInfo(true)}
        className={cn(
          "mb-6 p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all",
          isSyncConfigured 
            ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
            : "bg-slate-50 border-slate-200 text-slate-500"
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full animate-pulse",
            isSyncConfigured ? "bg-emerald-500" : "bg-slate-400"
          )} />
          <span className="text-xs font-bold uppercase tracking-wider">
            {isSyncConfigured ? "Google Sheets Terhubung" : "Google Sheets Belum Aktif"}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 opacity-50" />
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <MetricCard 
          title="Saturasi O2" 
          value={latest?.spo2} 
          unit="%" 
          icon={Activity} 
          color="bg-blue-500"
          status={getStatus('spo2', latest?.spo2)}
        />
        <MetricCard 
          title="Detak Jantung" 
          value={latest?.pulse} 
          unit="bpm" 
          icon={Heart} 
          color="bg-rose-500"
        />
        <MetricCard 
          title="Suhu Tubuh" 
          value={latest?.temperature} 
          unit="°C" 
          icon={Thermometer} 
          color="bg-amber-500"
          status={getStatus('temp', latest?.temperature)}
        />
        <MetricCard 
          title="Gula Darah" 
          value={latest?.blood_sugar} 
          unit="mg/dL" 
          icon={Droplets} 
          color="bg-emerald-500"
          status={getStatus('sugar', latest?.blood_sugar)}
        />
        <div className="col-span-2 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">Tekanan Darah</p>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900">
              {latest?.systolic ?? '--'}/{latest?.diastolic ?? '--'}
            </h3>
            <span className="text-slate-400 text-sm font-medium">mmHg</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      {records.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Tren Terakhir</h2>
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="time" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fill: '#94a3b8' }}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
                  }} 
                />
                <Line type="monotone" dataKey="spo2" stroke="#3b82f6" strokeWidth={3} dot={false} name="SpO2" />
                <Line type="monotone" dataKey="sugar" stroke="#10b981" strokeWidth={3} dot={false} name="Gula" />
                <Line type="monotone" dataKey="sys" stroke="#f43f5e" strokeWidth={3} dot={false} name="Tensi" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* History List */}
      <section className="mb-8">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Riwayat Catatan</h2>
            <History className="w-5 h-5 text-slate-400" />
          </div>
          
          {/* Time Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'hour', label: '1 Jam' },
              { id: 'day', label: 'Hari Ini' },
              { id: 'week', label: '1 Minggu' },
              { id: 'month', label: '1 Bulan' }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setTimeFilter(filter.id as TimeFilter)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                  timeFilter === filter.id 
                    ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" 
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-slate-400">Memuat data...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-slate-400 text-sm">Belum ada catatan untuk periode ini</p>
            </div>
          ) : (
            filteredRecords.map((record) => (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={record.id}
                className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-slate-100 rounded-lg">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      {format(parseISO(record.timestamp), 'd MMM, HH:mm', { locale: id })}
                    </span>
                  </div>
                  <button 
                    onClick={() => deleteRecord(record.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-y-3 gap-x-2 mb-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">SpO2</span>
                    <span className="text-sm font-bold text-slate-700">{record.spo2 ?? '-'}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Nadi</span>
                    <span className="text-sm font-bold text-slate-700">{record.pulse ?? '-'} bpm</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Suhu</span>
                    <span className="text-sm font-bold text-slate-700">{record.temperature ?? '-'}°C</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Tensi</span>
                    <span className="text-sm font-bold text-slate-700">{record.systolic ?? '-'}/{record.diastolic ?? '-'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Gula</span>
                    <span className="text-sm font-bold text-slate-700">{record.blood_sugar ?? '-'} mg/dL</span>
                  </div>
                </div>
                
                {(record.medications || record.notes || record.caregiver_name) && (
                  <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                    {record.medications && (
                      <div className="flex items-start gap-2">
                        <Pill className="w-3.5 h-3.5 text-blue-500 mt-0.5" />
                        <p className="text-xs text-slate-700 font-medium">Obat: {record.medications}</p>
                      </div>
                    )}
                    {record.notes && (
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                        <p className="text-xs text-slate-500 italic">"{record.notes}"</p>
                      </div>
                    )}
                    {record.caregiver_name && (
                      <div className="flex items-center gap-2 pt-1">
                        <div className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 text-slate-500" />
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Dicatat oleh: {record.caregiver_name}</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </section>

      {/* Floating Action Button */}
      <button 
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-200 hover:scale-110 active:scale-95 transition-transform z-40"
      >
        <Plus className="w-8 h-8" />
      </button>

      {/* Input Form Modal */}
      <AnimatePresence>
        {showSyncInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSyncInfo(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold text-slate-900 mb-4">Integrasi Google Sheets</h2>
              <div className="space-y-4 text-sm text-slate-600">
                <p>Anda dapat menghubungkan aplikasi ini ke Google Sheets untuk melihat data dalam format tabel secara langsung.</p>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                  <p className="font-bold text-slate-900">Cara Setup:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Buka Google Sheet baru.</li>
                    <li>Pilih <b>Extensions &gt; Apps Script</b>.</li>
                    <li>Salin kode dari file <code>GOOGLE_APPS_SCRIPT.js</code> di project ini.</li>
                    <li>Klik <b>Deploy &gt; New Deployment</b>.</li>
                    <li>Pilih <b>Web App</b>, akses: <b>Anyone</b>.</li>
                    <li>Salin URL Web App yang muncul.</li>
                    <li>Masukkan URL tersebut ke Environment Variable <code>GAS_WEB_APP_URL</code>.</li>
                  </ol>
                </div>
                {isSyncConfigured ? (
                  <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Status: Terkoneksi & Aktif</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-600 font-bold bg-amber-50 p-3 rounded-xl border border-amber-100">
                    <AlertCircle className="w-5 h-5" />
                    <span>Status: Belum Dikonfigurasi</span>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setShowSyncInfo(false)}
                className="w-full mt-6 bg-slate-900 text-white font-bold py-3 rounded-xl"
              >
                Mengerti
              </button>
            </motion.div>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">Tambah Catatan</h2>
                <button 
                  onClick={() => setShowForm(false)}
                  className="p-2 text-slate-400 hover:text-slate-600"
                >
                  Tutup
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Caregiver Identity */}
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-2">
                  <label className="text-xs font-bold text-blue-600 uppercase mb-2 block">Nama Anda (Perawat/Saudara)</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                    <input 
                      type="text" 
                      placeholder="Masukkan nama Anda..."
                      required
                      className="w-full bg-white border border-blue-200 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                      value={caregiverName}
                      onChange={e => setCaregiverName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Date/Time Picker */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Waktu Pengukuran</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="datetime-local" 
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                      value={formData.timestamp}
                      onChange={e => setFormData({...formData, timestamp: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Saturasi O2 (%)</label>
                    <input 
                      type="number" 
                      placeholder="98"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      value={formData.spo2}
                      onChange={e => setFormData({...formData, spo2: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Detak Jantung (bpm)</label>
                    <input 
                      type="number" 
                      placeholder="72"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      value={formData.pulse}
                      onChange={e => setFormData({...formData, pulse: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Suhu Tubuh (°C)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    placeholder="36.5"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    value={formData.temperature}
                    onChange={e => setFormData({...formData, temperature: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tekanan Darah (mmHg)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      placeholder="120"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      value={formData.systolic}
                      onChange={e => setFormData({...formData, systolic: e.target.value})}
                    />
                    <span className="text-slate-400 font-bold">/</span>
                    <input 
                      type="number" 
                      placeholder="80"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      value={formData.diastolic}
                      onChange={e => setFormData({...formData, diastolic: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Gula Darah (mg/dL)</label>
                  <input 
                    type="number" 
                    placeholder="110"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    value={formData.blood_sugar}
                    onChange={e => setFormData({...formData, blood_sugar: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Obat yang Diminum</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: Amlodipine 5mg, Metformin..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    value={formData.medications}
                    onChange={e => setFormData({...formData, medications: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Catatan Tambahan</label>
                  <textarea 
                    placeholder="Contoh: Sesudah makan, merasa pusing..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all h-24 resize-none"
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all mt-4"
                >
                  Simpan Catatan
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
