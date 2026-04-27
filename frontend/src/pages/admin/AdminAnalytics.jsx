import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  // Mount-only fetch — `api` is a singleton import, never changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { api.get("/admin/analytics").then(r => setData(r.data)); }, []);
  if (!data) return <div className="p-10 font-mono">Loading…</div>;
  return (
    <div className="p-8 space-y-6" data-testid="admin-analytics-page">
      <div>
        <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#6f8cff]">Platform analytics</div>
        <h1 className="font-display text-4xl font-black tracking-tighter">Across every vendor</h1>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Daily conversations (last 7 days)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.daily}>
              <CartesianGrid stroke="#0a0a0b" strokeDasharray="2 2" opacity={0.2}/>
              <XAxis dataKey="date" tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <YAxis tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <Tooltip contentStyle={{border:"2px solid #000", borderRadius:0}}/>
              <Line type="monotone" dataKey="count" stroke="#002FA7" strokeWidth={3}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Channel mix">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.by_channel}>
              <CartesianGrid stroke="#0a0a0b" strokeDasharray="2 2" opacity={0.2}/>
              <XAxis dataKey="channel" tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <YAxis tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
              <Tooltip contentStyle={{border:"2px solid #000", borderRadius:0}}/>
              <Bar dataKey="count" fill="#002FA7" stroke="#000" strokeWidth={2}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card title="Vendor leaderboard">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.leaderboard} layout="vertical">
            <CartesianGrid stroke="#0a0a0b" strokeDasharray="2 2" opacity={0.2}/>
            <XAxis type="number" tick={{fontSize: 10, fontFamily: "Azeret Mono"}}/>
            <YAxis type="category" dataKey="vendor" tick={{fontSize: 10}} width={160}/>
            <Tooltip contentStyle={{border:"2px solid #000", borderRadius:0}}/>
            <Bar dataKey="conversations" fill="#0a0a0b"/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
const Card = ({ title, children }) => (
  <div className="border-2 border-black bg-white p-5">
    <div className="text-xs font-bold tracking-[0.2em] uppercase">{title}</div>
    <div className="mt-4">{children}</div>
  </div>
);
