import { Phone, MessageCircle, Mail, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface RequesterContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  role: string | null;
}

interface RequesterContactCardProps {
  contact: RequesterContact | null;
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

export function RequesterContactCard({ contact }: RequesterContactCardProps) {
  if (!contact) {
    return null;
  }

  const phoneNumber = contact.whatsapp || contact.phone;
  const hasPhone = !!phoneNumber;
  const hasEmail = !!contact.email;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <User className="h-4 w-4" />
          Solicitante
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="font-medium">{contact.name}</p>
          {contact.role && (
            <p className="text-sm text-muted-foreground">{contact.role}</p>
          )}
        </div>

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
