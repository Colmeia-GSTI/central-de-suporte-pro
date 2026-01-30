import { useRef, useEffect, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DateClickArg, EventDropArg, EventResizeDoneArg, DatesSetArg } from "@fullcalendar/core";
import type { DateSelectArg } from "@fullcalendar/interaction";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Tables, Enums } from "@/integrations/supabase/types";

type EventWithClient = Tables<"calendar_events"> & {
  clients: { name: string } | null;
};

// Map event types to CSS color variables
const eventTypeColors: Record<Enums<"event_type">, string> = {
  visit: "hsl(199 89% 48%)", // info/progress
  meeting: "hsl(45 93% 47%)", // primary
  on_call: "hsl(38 92% 50%)", // warning
  unavailable: "hsl(220 10% 50%)", // muted
  personal: "hsl(40 96% 40%)", // accent
  billing_reminder: "hsl(0 84% 60%)", // destructive
};

const eventTypeLabels: Record<Enums<"event_type">, string> = {
  visit: "Visita",
  meeting: "Reunião",
  on_call: "Plantão",
  unavailable: "Indisponível",
  personal: "Pessoal",
  billing_reminder: "Cobrança",
};

interface FullCalendarWrapperProps {
  events: EventWithClient[];
  onEventClick: (eventId: string, event: EventWithClient) => void;
  onDateClick: (date: Date) => void;
  onEventDrop: (eventId: string, start: Date, end: Date) => void;
  onEventResize: (eventId: string, start: Date, end: Date) => void;
  onSelect: (start: Date, end: Date, allDay: boolean) => void;
  onDatesChange: (start: Date, end: Date) => void;
  isLoading?: boolean;
}

export function FullCalendarWrapper({
  events,
  onEventClick,
  onDateClick,
  onEventDrop,
  onEventResize,
  onSelect,
  onDatesChange,
  isLoading,
}: FullCalendarWrapperProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();

  // Transform events to FullCalendar format
  const calendarEvents = useMemo(() => {
    return events.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start_time,
      end: event.end_time,
      allDay: event.all_day,
      backgroundColor: eventTypeColors[event.event_type],
      borderColor: eventTypeColors[event.event_type],
      textColor: event.event_type === "meeting" || event.event_type === "on_call" ? "#1a1a1a" : "#ffffff",
      extendedProps: {
        client: event.clients?.name,
        location: event.location,
        type: event.event_type,
        typeLabel: eventTypeLabels[event.event_type],
        description: event.description,
        originalEvent: event,
      },
    }));
  }, [events]);

  // Handle window resize for responsive view switching
  useEffect(() => {
    const handleResize = () => {
      const calendarApi = calendarRef.current?.getApi();
      if (!calendarApi) return;

      const width = window.innerWidth;
      const currentView = calendarApi.view.type;

      // Switch to list view on mobile, month view on desktop
      if (width < 768 && !currentView.startsWith("list")) {
        calendarApi.changeView("listWeek");
      } else if (width >= 768 && currentView.startsWith("list") && currentView !== "listWeek") {
        calendarApi.changeView("dayGridMonth");
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleEventClick = (info: EventClickArg) => {
    const originalEvent = info.event.extendedProps.originalEvent as EventWithClient;
    onEventClick(info.event.id, originalEvent);
  };

  const handleDateClick = (info: DateClickArg) => {
    onDateClick(info.date);
  };

  const handleEventDrop = (info: EventDropArg) => {
    if (info.event.start && info.event.end) {
      onEventDrop(info.event.id, info.event.start, info.event.end);
    } else if (info.event.start) {
      // For all-day events, end might be null
      const end = new Date(info.event.start);
      end.setHours(end.getHours() + 1);
      onEventDrop(info.event.id, info.event.start, end);
    }
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    if (info.event.start && info.event.end) {
      onEventResize(info.event.id, info.event.start, info.event.end);
    }
  };

  const handleSelect = (info: DateSelectArg) => {
    onSelect(info.start, info.end, info.allDay);
  };

  const handleDatesSet = (info: DatesSetArg) => {
    onDatesChange(info.start, info.end);
  };

  return (
    <div className={`fc-wrapper ${isLoading ? "opacity-50" : ""}`}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={isMobile ? "listWeek" : "dayGridMonth"}
        headerToolbar={
          isMobile
            ? {
                left: "prev,next",
                center: "title",
                right: "listWeek,timeGridDay",
              }
            : {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }
        }
        buttonText={{
          today: "Hoje",
          month: "Mês",
          week: "Semana",
          day: "Dia",
          list: "Agenda",
        }}
        locale="pt-br"
        firstDay={0} // Sunday
        weekends={true}
        editable={true}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={true}
        nowIndicator={true}
        navLinks={true}
        events={calendarEvents}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        select={handleSelect}
        datesSet={handleDatesSet}
        height="auto"
        contentHeight="auto"
        aspectRatio={isMobile ? 1.2 : 1.8}
        stickyHeaderDates={true}
        handleWindowResize={true}
        eventDisplay="block"
        eventTimeFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
        slotLabelFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        allDayText="Dia todo"
        noEventsText="Nenhum evento"
        moreLinkText={(n) => `+${n} mais`}
        eventContent={(eventInfo) => {
          const { typeLabel, client, location } = eventInfo.event.extendedProps;
          return (
            <div className="fc-event-content p-1 overflow-hidden">
              <div className="font-medium text-xs truncate">{eventInfo.event.title}</div>
              {!eventInfo.view.type.startsWith("list") && client && (
                <div className="text-[10px] opacity-80 truncate">{client}</div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
