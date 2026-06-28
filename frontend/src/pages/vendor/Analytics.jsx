import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function Analytics() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/analytics").then(r => setData(r.data)); }, []);
  if (!data) return <div className="p-10 font-mono">Loading…</div>;
  const t = data.totals;
  return (
    <div className="p-4 sm:p-8 space-y-6" data-testid="analytics-page">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Analytics</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">How's your bot doing?</h1>
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="Conversations" value={t.conversations} tid="a-stat-c"/>
        <Stat label="Messages" value={t.messages} tid="a-stat-m"/>
        <Stat label="Appointments" value={t.appointments} tid="a-stat-a"/>
        <Stat label="Resolution rate" value={`${t.resolution_rate}%`} tid="a-stat-r"/>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Daily conversations (last 7 days)" tid="chart-daily">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.daily}>
              <CartesianGrid stroke="#0a0a0b" strokeDasharray="2 2" opacity={0.2}/>
              <XAxis dataKey="date" tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <YAxis tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <Tooltip contentStyle={{border:"2px solid #000", borderRadius:0}}/>
              <Line type="monotone" dataKey="count" stroke="#002FA7" strokeWidth={3} dot={{r:4, fill:"#0a0a0b"}}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Hourly activity" tid="chart-hourly">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.hourly}>
              <CartesianGrid stroke="#0a0a0b" strokeDasharray="2 2" opacity={0.2}/>
              <XAxis dataKey="hour" tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <YAxis tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <Tooltip contentStyle={{border:"2px solid #000", borderRadius:0}}/>
              <Bar dataKey="count" fill="#002FA7" stroke="#0a0a0b" strokeWidth={2}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card title="By channel" tid="chart-channel">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.by_channel}>
            <CartesianGrid stroke="#0a0a0b" strokeDasharray="2 2" opacity={0.2}/>
            <XAxis dataKey="channel" tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
            <YAxis tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
            <Tooltip contentStyle={{border:"2px solid #000", borderRadius:0}}/>
            <Bar dataKey="count" fill="#0a0a0b" stroke="#0a0a0b" strokeWidth={2}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

const Stat = ({ label, value, tid }) => (
  <div className="border-2 border-black bg-white p-5" data-testid={tid}>
    <div className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-600">{label}</div>
    <div className="font-display font-black text-4xl tracking-tighter mt-2">{value}</div>
  </div>
);

const Card = ({ title, children, tid }) => (
  <div className="border-2 border-black bg-white p-5" data-testid={tid}>
    <div className="text-xs font-bold tracking-[0.2em] uppercase">{title}</div>
    <div className="mt-4">{children}</div>
  </div>
);
