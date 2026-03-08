import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Phone, FileText, Save, Loader2, Search } from "lucide-react";
import { ServiceCodeSelect } from "@/components/nfse/ServiceCodeSelect";
import { CertificateManager } from "./CertificateManager";
import { BusinessHoursForm } from "./BusinessHoursForm";

const companySchema = z.object({
  razao_social: z.string().min(1, "Razão social é obrigatória"),
  nome_fantasia: z.string().optional(),
  cnpj: z.string().min(14, "CNPJ inválido").max(18),
  inscricao_municipal: z.string().optional(),
  inscricao_estadual: z.string().optional(),
  
  endereco_logradouro: z.string().optional(),
  endereco_numero: z.string().optional(),
  endereco_complemento: z.string().optional(),
  endereco_bairro: z.string().optional(),
  endereco_cidade: z.string().optional(),
  endereco_uf: z.string().optional(),
  endereco_cep: z.string().optional(),
  endereco_codigo_ibge: z.string().optional(),
  
  telefone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  
  nfse_ambiente: z.string().default("producao_restrita"),
  nfse_regime_tributario: z.string().default("simples_nacional"),
  nfse_optante_simples: z.boolean().default(true),
  nfse_incentivador_cultural: z.boolean().default(false),
  nfse_aliquota_padrao: z.coerce.number().min(0).max(100).default(6),
  nfse_codigo_tributacao_padrao: z.string().optional(),
  nfse_cnae_padrao: z.string().optional(),
  nfse_descricao_servico_padrao: z.string().optional(),
  
  certificado_tipo: z.string().default("A1"),
  certificado_validade: z.string().optional(),
});

type CompanyFormData = z.infer<typeof companySchema>;

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export default function CompanyTab() {
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      razao_social: "TAUFFER SPERANDIO INFORMATICA LTDA",
      cnpj: "",
      nfse_ambiente: "producao_restrita",
      nfse_regime_tributario: "simples_nacional",
      nfse_optante_simples: true,
      nfse_incentivador_cultural: false,
      nfse_aliquota_padrao: 6,
      nfse_codigo_tributacao_padrao: "010701",
      certificado_tipo: "A1",
      endereco_uf: "SC",
    },
  });

  // Persist draft locally to survive browser tab discards / refresh.
  // This avoids losing in-progress edits when switching tabs.
  const { clearDraft, hasDraft } = useFormPersistence<CompanyFormData>({
    form,
    key: "company_settings",
    storage: "local",
    debounceMs: 500,
    enabled: true,
  });

  useEffect(() => {
    loadCompanySettings();
  }, []);

  const loadCompanySettings = async () => {
    try {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, razao_social, nome_fantasia, cnpj, inscricao_municipal, inscricao_estadual, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, endereco_codigo_ibge, telefone, email, nfse_ambiente, nfse_regime_tributario, nfse_optante_simples, nfse_incentivador_cultural, nfse_aliquota_padrao, nfse_cnae_padrao, nfse_codigo_tributacao_padrao, nfse_descricao_servico_padrao, business_hours")
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setCompanyId(data.id);

        // If user has a local draft, keep it (prevents losing unsaved edits after refresh).
        if (!hasDraft()) {
          form.reset({
            razao_social: data.razao_social || "",
            nome_fantasia: data.nome_fantasia || "",
            cnpj: data.cnpj || "",
            inscricao_municipal: data.inscricao_municipal || "",
            inscricao_estadual: data.inscricao_estadual || "",
            endereco_logradouro: data.endereco_logradouro || "",
            endereco_numero: data.endereco_numero || "",
            endereco_complemento: data.endereco_complemento || "",
            endereco_bairro: data.endereco_bairro || "",
            endereco_cidade: data.endereco_cidade || "",
            endereco_uf: data.endereco_uf || "SC",
            endereco_cep: data.endereco_cep || "",
            endereco_codigo_ibge: data.endereco_codigo_ibge || "",
            telefone: data.telefone || "",
            email: data.email || "",
            nfse_ambiente: data.nfse_ambiente || "producao_restrita",
            nfse_regime_tributario: data.nfse_regime_tributario || "simples_nacional",
            nfse_optante_simples: data.nfse_optante_simples ?? true,
            nfse_incentivador_cultural: data.nfse_incentivador_cultural ?? false,
            nfse_aliquota_padrao: Number(data.nfse_aliquota_padrao) || 6,
            nfse_codigo_tributacao_padrao: data.nfse_codigo_tributacao_padrao || "010701",
            nfse_cnae_padrao: data.nfse_cnae_padrao || "",
            nfse_descricao_servico_padrao: data.nfse_descricao_servico_padrao || "",
            certificado_tipo: data.certificado_tipo || "A1",
            certificado_validade: data.certificado_validade || "",
          });
        }
      }
    } catch (error) {
      logger.error("Erro ao carregar configurações", "Settings", { error: String(error) });
      toast.error("Não foi possível carregar as configurações da empresa.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CompanyFormData) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        nfse_aliquota_padrao: data.nfse_aliquota_padrao,
        certificado_validade: data.certificado_validade || null,
      };

      if (companyId) {
        const { error } = await supabase
          .from("company_settings")
          .update(payload)
          .eq("id", companyId);
        if (error) throw error;
      } else {
        const { data: newData, error } = await supabase
          .from("company_settings")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setCompanyId(newData.id);
      }

      toast.success("Configurações da empresa salvas com sucesso.");

      clearDraft();
    } catch (error) {
      logger.error("Erro ao salvar", "Settings", { error: String(error) });
      toast.error("Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 14);
    return numbers
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 8);
    return numbers.replace(/(\d{5})(\d)/, "$1-$2");
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d)/, "($1) $2-$3");
    }
    return numbers.replace(/(\d{2})(\d{5})(\d)/, "($1) $2-$3");
  };

  const searchCNPJ = async () => {
    const cnpj = form.getValues("cnpj")?.replace(/\D/g, "");
    
    if (!cnpj || cnpj.length !== 14) {
      toast.error("Digite um CNPJ válido com 14 dígitos");
      return;
    }

    setIsSearchingCnpj(true);
    try {
      const { data, error } = await supabase.functions.invoke('cnpj-lookup', {
        body: { cnpj }
      });

      if (error) throw error;

      if (data.status === "ERROR") {
        toast.error(data.message || "Não foi possível encontrar o CNPJ informado");
        return;
      }

      // Fill form with returned data
      form.setValue("razao_social", data.nome || "");
      form.setValue("nome_fantasia", data.fantasia || "");
      form.setValue("email", data.email || "");
      form.setValue("telefone", data.telefone?.split("/")[0]?.trim() || "");
      form.setValue("endereco_logradouro", data.logradouro || "");
      form.setValue("endereco_numero", data.numero || "");
      form.setValue("endereco_complemento", data.complemento || "");
      form.setValue("endereco_bairro", data.bairro || "");
      form.setValue("endereco_cidade", data.municipio || "");
      form.setValue("endereco_uf", data.uf || "");
      form.setValue("endereco_cep", formatCEP(data.cep?.replace(/\D/g, "") || ""));

      toast.success("Os dados do CNPJ foram carregados com sucesso");
    } catch (error: unknown) {
      logger.error("CNPJ lookup error", "Settings", { error: String(error) });
      toast({
        title: "Erro na consulta",
        description: "Não foi possível consultar o CNPJ. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Dados Cadastrais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Dados Cadastrais
            </CardTitle>
            <CardDescription>
              Informações da empresa para emissão de NFS-e
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="razao_social"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razão Social *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome empresarial" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nome_fantasia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Fantasia</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome fantasia" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ *</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="00.000.000/0001-00"
                          onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                          maxLength={18}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={searchCNPJ}
                        disabled={isSearchingCnpj}
                        title="Consultar CNPJ"
                      >
                        {isSearchingCnpj ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="inscricao_municipal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inscrição Municipal</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Número da IM" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inscricao_estadual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inscrição Estadual</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Número da IE" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Endereço */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Endereço
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="endereco_logradouro"
                render={({ field }) => (
                  <FormItem className="md:col-span-3">
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Rua, Avenida, etc." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endereco_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nº" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="endereco_complemento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complemento</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Sala, Bloco, etc." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endereco_bairro"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Bairro" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="endereco_cidade"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Cidade" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endereco_uf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UF</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {UF_OPTIONS.map((uf) => (
                          <SelectItem key={uf} value={uf}>
                            {uf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endereco_cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="00000-000"
                        onChange={(e) => field.onChange(formatCEP(e.target.value))}
                        maxLength={9}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="endereco_codigo_ibge"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Código IBGE do Município</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: 4209102" />
                  </FormControl>
                  <FormDescription>
                    Código de 7 dígitos do IBGE
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Contato */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Contato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="(00) 00000-0000"
                        onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        maxLength={15}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="contato@empresa.com.br" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Configurações NFS-e */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Configurações NFS-e
            </CardTitle>
            <CardDescription>
              Parâmetros padrão para emissão de Nota Fiscal de Serviço
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nfse_ambiente"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ambiente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="producao_restrita">Produção Restrita (Homologação)</SelectItem>
                        <SelectItem value="producao">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nfse_regime_tributario"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Regime Tributário</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                        <SelectItem value="simples_excesso">Simples Nacional - Excesso</SelectItem>
                        <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                        <SelectItem value="lucro_real">Lucro Real</SelectItem>
                        <SelectItem value="mei">MEI</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-6">
              <FormField
                control={form.control}
                name="nfse_optante_simples"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer">
                      Optante pelo Simples Nacional
                    </FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nfse_incentivador_cultural"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer">
                      Incentivador Cultural
                    </FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nfse_aliquota_padrao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alíquota Padrão (%)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="6.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nfse_cnae_padrao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNAE Padrão</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: 6209100" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nfse_codigo_tributacao_padrao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código de Tributação Padrão</FormLabel>
                  <ServiceCodeSelect
                    value={field.value}
                    onSelect={(code) => {
                      field.onChange(code?.codigo_tributacao || "");
                      if (code?.cnae_principal) {
                        form.setValue("nfse_cnae_padrao", code.cnae_principal);
                      }
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nfse_descricao_servico_padrao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição Padrão do Serviço</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descrição detalhada do serviço que será usada como padrão nas NFS-e..."
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    Esta descrição será usada como padrão em novos contratos
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Horário Comercial */}
        <BusinessHoursForm />

        {/* Certificado Digital - Componente completo */}
        <CertificateManager companyId={companyId} />

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
