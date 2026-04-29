import { Phone, MessageCircle, Mail, User, Monitor, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RequesterContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  role: string | null;
}

interface MonitoredDeviceRef {
  id: string;
  hostname: string | null;
  name: string | null;
  is_online: boolean | null;
}

interface RequesterContactCardProps {
  contact: RequesterContact | null;
  contactPhone?: string | null;
  contactPhoneIsWhatsapp?: boolean | null;
  monitoredDevice?: MonitoredDeviceRef | null;
  deviceHostnameText?: string | null;
}

function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-numeric characters
  return phone.replace(/\D/g, "");
}

function formatPhoneForDisplay(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function RequesterContactCard({
  contact,
  contactPhone,
  contactPhoneIsWhatsapp,
  monitoredDevice,
  deviceHostnameText,
}: RequesterContactCardProps) {
  if (!contact && !contactPhone && !monitoredDevice && !deviceHostnameText) {
    return null;
  }

  const phoneNumber = contact?.whatsapp || contact?.phone;
  const hasPhone = !!phoneNumber;
  const hasEmail = !!contact?.email;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          Solicitante
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contact && (
          <div>
            <p className="font-medium">{contact.name}</p>
            {contact.role && (
              <p className="text-sm text-muted-foreground">{contact.role}</p>
            )}
          </div>
        )}

        {/* Contact phone provided on ticket creation */}
        {contactPhone && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-accent/50 border border-accent">
            <Phone className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                Telefone informado no chamado
                {contactPhoneIsWhatsapp && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] gap-1 text-green-600 border-green-600">
                    <MessageCircle className="h-2.5 w-2.5" />
                    WhatsApp
                  </Badge>
                )}
              </p>
              <div className="flex gap-2 mt-1">
                <Button variant="outline" size="sm" className="gap-2 h-7" asChild>
                  <a href={`tel:${contactPhone}`}>
                    <Phone className="h-3 w-3" />
                    {formatPhoneForDisplay(contactPhone)}
                  </a>
                </Button>
                {contactPhoneIsWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-7 text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                    asChild
                  >
                    <a href={`https://wa.me/55${contactPhone}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-3 w-3" />
                      WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Related computer (monitored device or free-text hostname) */}
        {(monitoredDevice || deviceHostnameText) && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-accent/50 border border-accent">
            {monitoredDevice ? (
              <Monitor className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            ) : (
              <Pencil className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Computador relacionado</p>
              {monitoredDevice ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-medium truncate">
                    {monitoredDevice.hostname || monitoredDevice.name || "(sem nome)"}
                  </span>
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${monitoredDevice.is_online ? "bg-green-500" : "bg-muted-foreground"}`}
                    title={monitoredDevice.is_online ? "Online" : "Offline"}
                  />
                </div>
              ) : (
                <p className="text-sm font-medium italic" title="Hostname informado livremente pelo cliente">
                  {deviceHostnameText}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {hasPhone && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                asChild
              >
                <a href={`tel:${formatPhoneForWhatsApp(phoneNumber!)}`}>
                  <Phone className="h-4 w-4" />
                  {formatPhoneForDisplay(phoneNumber!)}
                </a>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                asChild
              >
                <a
                  href={`https://wa.me/55${formatPhoneForWhatsApp(phoneNumber!)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
            </>
          )}

          {hasEmail && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              asChild
            >
              <a href={`mailto:${contact.email}`}>
                <Mail className="h-4 w-4" />
                {contact.email}
              </a>
            </Button>
          )}
        </div>

        {!hasPhone && !hasEmail && (
          <p className="text-sm text-muted-foreground italic">
            Nenhum contato disponível
          </p>
        )}
      </CardContent>
    </Card>
  );
}
