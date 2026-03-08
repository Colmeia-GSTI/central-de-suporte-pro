import { useState, useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { EventForm } from "@/components/calendar/EventForm";
import { FullCalendarWrapper } from "@/components/calendar/FullCalendarWrapper";
import { EventDetailsSheet } from "@/components/calendar/EventDetailsSheet";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type EventWithClient = Tables<"calendar_events"> & {
  clients: { name: string } | null;
};

export default function CalendarPage() {
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return {
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    };
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventWithClient | null>(null);
  const [isEventSheetOpen, setIsEventSheetOpen] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { can } = usePermissions();
  const canCreate = can("calendar", "create");
  const canEdit = can("calendar", "edit");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar-events", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*, clients(name)")
        .gte("start_time", dateRange.start.toISOString())
        .lte("start_time", dateRange.end.toISOString())
        .order("start_time");
      if (error) throw error;
      return data as EventWithClient[];
    },
  });

  // Mutation for updating event times (drag & drop / resize)
  const updateEventMutation = useMutation({
    mutationFn: async ({
      eventId,
      start,
      end,
    }: {
      eventId: string;
      start: Date;
      end: Date;
    }) => {
      const { error } = await supabase
        .from("calendar_events")
        .update({
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast({ title: "Evento atualizado" });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
      // Refetch to reset the calendar
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const handleEventClick = useCallback((eventId: string, event: EventWithClient) => {
    setSelectedEvent(event);
    setIsEventSheetOpen(true);
  }, []);

  const handleDateClick = useCallback((date: Date) => {
    if (!canCreate) return;
    setSelectedDate(date);
    setIsFormOpen(true);
  }, [canCreate]);

  const handleEventDrop = useCallback(
    (eventId: string, start: Date, end: Date) => {
      updateEventMutation.mutate({ eventId, start, end });
    },
    [updateEventMutation]
  );

  const handleEventResize = useCallback(
    (eventId: string, start: Date, end: Date) => {
      updateEventMutation.mutate({ eventId, start, end });
    },
    [updateEventMutation]
  );

  const handleSelect = useCallback((start: Date, end: Date, allDay: boolean) => {
    setSelectedDate(start);
    setIsFormOpen(true);
  }, []);

  const handleDatesChange = useCallback((start: Date, end: Date) => {
    setDateRange({ start, end });
  }, []);

  const handleFormSuccess = useCallback(() => {
    setIsFormOpen(false);
    setSelectedDate(null);
  }, []);

  const handleFormCancel = useCallback(() => {
    setIsFormOpen(false);
    setSelectedDate(null);
  }, []);

  // Use Sheet on mobile, Dialog on desktop
  const FormWrapper = isMobile ? (
    <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Novo Evento</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <EventForm
            selectedDate={selectedDate}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </div>
      </SheetContent>
    </Sheet>
  ) : (
    <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Evento</DialogTitle>
        </DialogHeader>
        <EventForm
          selectedDate={selectedDate}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      </DialogContent>
    </Dialog>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agenda</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Gerencie visitas, reuniões e plantões
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setIsFormOpen(true)} size={isMobile ? "sm" : "default"}>
              <Plus className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Novo Evento</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          )}
        </div>

        {/* Calendar */}
        <Card>
          <CardContent className="p-2 md:p-4">
            <FullCalendarWrapper
              events={events}
              onEventClick={handleEventClick}
              onDateClick={handleDateClick}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventResize}
              onSelect={handleSelect}
              onDatesChange={handleDatesChange}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog/Sheet */}
      {FormWrapper}

      {/* Event Details Sheet */}
      <EventDetailsSheet
        event={selectedEvent}
        open={isEventSheetOpen}
        onOpenChange={setIsEventSheetOpen}
      />
    </AppLayout>
  );
}
