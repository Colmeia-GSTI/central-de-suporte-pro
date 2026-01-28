import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  MapPin,
  Clock,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { EventForm } from "@/components/calendar/EventForm";
import type { Tables, Enums } from "@/integrations/supabase/types";

type EventWithClient = Tables<"calendar_events"> & {
  clients: { name: string } | null;
};

const eventTypeLabels: Record<Enums<"event_type">, string> = {
  visit: "Visita",
  meeting: "Reunião",
  on_call: "Plantão",
  unavailable: "Indisponível",
  personal: "Pessoal",
  billing_reminder: "Cobrança",
};

const eventTypeColors: Record<Enums<"event_type">, string> = {
  visit: "bg-status-progress",
  meeting: "bg-primary",
  on_call: "bg-status-warning",
  unavailable: "bg-muted",
  personal: "bg-accent",
  billing_reminder: "bg-destructive",
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar-events", format(currentMonth, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*, clients(name)")
        .gte("start_time", calendarStart.toISOString())
        .lte("start_time", calendarEnd.toISOString())
        .order("start_time");
      if (error) throw error;
      return data as EventWithClient[];
    },
  });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (date: Date) => {
    return events.filter((event) => isSameDay(new Date(event.start_time), date));
  };

  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
            <p className="text-muted-foreground">
              Gerencie visitas, reuniões e plantões
            </p>
          </div>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Evento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo Evento</DialogTitle>
              </DialogHeader>
              <EventForm
                selectedDate={selectedDate}
                onSuccess={() => setIsFormOpen(false)}
                onCancel={() => setIsFormOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
          {/* Calendar Grid */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-lg font-semibold">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentMonth(new Date())}
                >
                  Hoje
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 mb-2">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        min-h-[80px] p-1 text-left rounded-lg border transition-colors
                        ${isCurrentMonth ? "bg-card" : "bg-muted/30"}
                        ${isSelected ? "ring-2 ring-primary" : ""}
                        ${isToday ? "border-primary" : "border-transparent"}
                        hover:bg-accent/50
                      `}
                    >
                      <span
                        className={`
                          text-sm font-medium
                          ${!isCurrentMonth && "text-muted-foreground"}
                          ${isToday && "text-primary"}
                        `}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className={`
                              text-[10px] px-1 py-0.5 rounded truncate text-white
                              ${eventTypeColors[event.event_type]}
                            `}
                          >
                            {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">
                            +{dayEvents.length - 3} mais
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Events Sidebar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {selectedDate
                  ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                  : "Selecione um dia"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDate ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  Clique em um dia para ver os eventos
                </p>
              ) : selectedDayEvents.length === 0 ? (
                <div className="text-center py-8">
                  <CalendarIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground text-sm">
                    Nenhum evento neste dia
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setIsFormOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Evento
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{event.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(new Date(event.start_time), "HH:mm")} -{" "}
                            {format(new Date(event.end_time), "HH:mm")}
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </div>
                          )}
                          {event.clients && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {event.clients.name}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`${eventTypeColors[event.event_type]} text-white border-0`}
                        >
                          {eventTypeLabels[event.event_type]}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
