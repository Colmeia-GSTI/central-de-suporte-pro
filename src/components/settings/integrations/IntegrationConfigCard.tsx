import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, TestTube, Check, X } from "lucide-react";

interface Props {
  icon: ReactNode;
  iconBgClass?: string;
  title: string;
  description: string;
  /** Quando true, mostra badge "Ativo" verde; senão "Inativo". */
  active: boolean;
  /** Se a config considerada "preenchida" (usado junto de active para a badge). */
  configured?: boolean;
  onActiveChange: (v: boolean) => void;
  /** Conteúdo dos campos específicos da integração. */
  children: ReactNode;
  /** Salvar */
  onSave: () => void;
  saving: boolean;
  /** Bloco de teste opcional (input + botão). Se onTest fornecido, mostra botão Testar. */
  onTest?: () => void;
  testing?: boolean;
  testLabel?: string;
  /** Conteúdo extra à esquerda do botão Testar (ex.: input de chat id de teste). */
  testSlot?: ReactNode;
  saveLabel?: string;
}

export function IntegrationConfigCard({
  icon, iconBgClass = "bg-primary/10",
  title, description,
  active, configured = true, onActiveChange,
  children,
  onSave, saving,
  onTest, testing = false, testLabel = "Testar", testSlot,
  saveLabel = "Salvar Configurações",
}: Props) {
  const showActive = active && configured;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${iconBgClass}`}>{icon}</div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {title}
                {showActive ? (
                  <Badge variant="default" className="bg-green-500">
                    <Check className="h-3 w-3 mr-1" />Ativo
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <X className="h-3 w-3 mr-1" />Inativo
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Ativo</Label>
            <Switch checked={active} onCheckedChange={onActiveChange} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}

        {onTest && (
          <div className="border-t pt-4 flex items-center gap-2">
            {testSlot}
            <Button variant="outline" onClick={onTest} disabled={testing} className={testSlot ? "" : "ml-auto"}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TestTube className="h-4 w-4 mr-2" />}
              {testLabel}
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {saveLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
