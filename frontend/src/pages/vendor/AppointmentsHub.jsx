import { useState } from "react";
import { CalendarDays, Clock, Tags, Link2 } from "lucide-react";
import Appointments from "./Appointments";
import AvailabilityTab from "../../components/scheduling/AvailabilityTab";
import AppointmentTypesTab from "../../components/scheduling/AppointmentTypesTab";
import BookingPageTab from "../../components/scheduling/BookingPageTab";

const TABS = [
  { id: "list", label: "Appointments", icon: CalendarDays },
  { id: "availability", label: "Availability", icon: Clock },
  { id: "types", label: "Appointment Types", icon: Tags },
  { id: "booking", label: "Booking Page", icon: Link2 },
];

export default function AppointmentsHub() {
  const [tab, setTab] = useState("list");
  return (
    <div className="p-4 sm:p-8" data-testid="appointments-hub">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#002FA7]">Scheduling Hub</div>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter">Appointments</h1>
          <p className="text-sm text-neutral-600 mt-1">All your bookings, availability and calendar tools in one place.</p>
        </div>
      </div>

      <div className="border-b-2 border-black flex gap-0 overflow-x-auto mt-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`appt-tab-${t.id}`}
              className={`px-3 sm:px-4 py-2.5 text-sm font-bold border-2 border-b-0 -mb-0.5 whitespace-nowrap ${active ? "bg-[#002FA7] text-white border-black" : "bg-transparent border-transparent text-neutral-700 hover:text-black"}`}>
              <Icon size={13} className="inline -mt-0.5 mr-1.5" />{t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "list" && <Appointments />}
        {tab === "availability" && <AvailabilityTab />}
        {tab === "types" && <AppointmentTypesTab />}
        {tab === "booking" && <BookingPageTab />}
      </div>
    </div>
  );
}
