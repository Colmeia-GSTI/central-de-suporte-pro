import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, XCircle } from "lucide-react";
import { NfseServiceCodeCombobox, type NfseServiceCode } from "../NfseServiceCodeCombobox";
import { NfseTributacaoSection, type TributacaoData } from "../NfseTributacaoSection";
import { normalizeCompetencia } from "../nfseValidation";
import type { NfseWithRelations } from "../NfseDetailsSheet";

interface NfseEditFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nfse: NfseWithRelations;
  valor: number;
  setValor: (v: number) => void;
  competencia: string;
  setCompetencia: (v: string) => void;
  descricao: string;
  setDescricao: (v: string) => void;
  codigoTributacao: string;
  setCodigoTributacao: (v: string) => void;
  cnae: string;
  setCnae: (v: string) => void;
  tributacao: TributacaoData;
  setTributacao: React.Dispatch<React.SetStateAction<TributacaoData>>;
  companyForValidation: {
    nfse_aliquota_padrao?: number | null;
    nfse_regime_tributario?: string | null;
  } | null | undefined;
  onSave: () => void;
  isSaving: boolean;
}

export function NfseEditForm({
  open,
  onOpenChange,
  nfse,
  valor,
  setValor,
  competencia,
  setCompetencia,
  descricao,
  setDescricao,
  codigoTributacao,
  setCodigoTributacao,
  cnae,
  setCnae,
  tributacao,
  setTributacao,
  companyForValidation,
  onSave,
  isSaving,
}: NfseEditFormProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o && nfse) {
          setValor(nfse.valor_servico);
          setCompetencia(normalizeCompetencia(nfse.competencia));
          setDescricao(nfse.descricao_servico || "");
          setCodigoTributacao(nfse.codigo_tributacao ?? "");
          setCnae(nfse.cnae ?? "");
          setTributacao({
            issRetido: nfse.iss_retido ?? false,
            aliquotaIss: Number(nfse.aliquota) || 0,
            valorPis: Number(nfse.valor_pis) || 0,
            valorCofins: Number(nfse.valor_cofins) || 0,
            valorCsll: Number(nfse.valor_csll) || 0,
            valorIrrf: Number(nfse.valor_irrf) || 0,
            valorInss: Number(nfse.valor_inss) || 0,
          });
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar NFS-e</DialogTitle>
          <DialogDescription>Corrija os dados fiscais e reenvie para processamento.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-4">
            {/* Erro atual da nota */}
            {nfse.mensagem_retorno && ["erro", "rejeitada"].includes(nfse.status) && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">Erro atual:</p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs">{nfse.mensagem_retorno}</pre>
                </AlertDescription>
              </Alert>
            )}

            {/* Dados básicos */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor do serviço</Label>
                <CurrencyInput value={valor} onChange={setValor} />
              </div>
              <div className="space-y-2">
                <Label>Competência (AAAA-MM)</Label>
                <Input
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                  placeholder="2026-01"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição do serviço</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
            </div>

            <Separator />

            {/* Código de Serviço */}
            <div className="space-y-2">
              <Label>Código de Serviço (LC 116/2003)</Label>
              <NfseServiceCodeCombobox
                value={codigoTributacao}
                onChange={(code: NfseServiceCode | null) => {
                  if (code) {
                    setCodigoTributacao(code.codigo_tributacao);
                    if (code.cnae_principal) setCnae(code.cnae_principal);
                    if (code.aliquota_sugerida !== null && code.aliquota_sugerida !== undefined) {
                      setTributacao(prev => ({ ...prev, aliquotaIss: code.aliquota_sugerida! }));
                    }
                  } else {
                    setCodigoTributacao("");
                  }
                }}
              />
            </div>

            {/* CNAE */}
            <div className="space-y-2">
              <Label>CNAE</Label>
              <Input
                value={cnae}
                onChange={(e) => setCnae(e.target.value)}
                placeholder="Ex: 6202-3/00"
              />
            </div>

            {/* Tributação completa */}
            <NfseTributacaoSection
              valorServico={valor}
              aliquotaIss={tributacao.aliquotaIss || companyForValidation?.nfse_aliquota_padrao || 0}
              data={tributacao}
              onChange={setTributacao}
              regimeTributario={companyForValidation?.nfse_regime_tributario ?? undefined}
            />
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
