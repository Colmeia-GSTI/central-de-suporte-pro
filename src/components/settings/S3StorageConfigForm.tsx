import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertCircle, Loader2, Trash2 } from "lucide-react";

const s3ConfigSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  provider: z.enum(["netskope", "s3", "minio", "wasabi", "backblaze"]),
  endpoint: z.string().url("URL de endpoint inválida"),
  region: z.string().min(1, "Região é obrigatória"),
  bucket_name: z.string().min(1, "Nome do bucket é obrigatório"),
  access_key: z.string().min(1, "Access Key é obrigatória"),
  secret_key: z.string().min(1, "Secret Key é obrigatória"),
  path_prefix: z.string().default("{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf"),
  signed_url_expiry_hours: z.coerce.number().int().min(1).max(720).default(48),
});

type S3ConfigFormData = z.infer<typeof s3ConfigSchema>;

interface StorageConfig extends S3ConfigFormData {
  id: string;
  is_active: boolean;
  last_tested_at?: string;
  last_test_result?: string;
  created_at: string;
  updated_at: string;
}

export function S3StorageConfigForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  );

  const [testing, setTesting] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);

  const form = useForm<S3ConfigFormData>({
    resolver: zodResolver(s3ConfigSchema),
    defaultValues: {
      name: "",
      description: "",
      provider: "netskope",
      endpoint: "https://",
      region: "us-east-1",
      bucket_name: "",
      access_key: "",
      secret_key: "",
      path_prefix: "{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf",
      signed_url_expiry_hours: 48,
    },
  });

  // Carregar configurações existentes
  const { data: configs = [] } = useQuery({
    queryKey: ["storage_configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_config")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as StorageConfig[];
    },
  });

  // Criar/atualizar configuração
  const saveMutation = useMutation({
    mutationFn: async (data: S3ConfigFormData) => {
      if (selectedConfigId) {
        // Atualizar
        const { error } = await supabase
          .from("storage_config")
          .update(data)
          .eq("id", selectedConfigId);

        if (error) throw error;
        return { message: "Configuração atualizada com sucesso" };
      } else {
        // Criar
        const { error } = await supabase.from("storage_config").insert([data]);

        if (error) throw error;
        return { message: "Configuração criada com sucesso" };
      }
    },
    onSuccess: (result) => {
      toast({
        title: "Sucesso",
        description: result.message,
      });
      queryClient.invalidateQueries({ queryKey: ["storage_configs"] });
      form.reset();
      setSelectedConfigId(null);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar configuração",
        variant: "destructive",
      });
    },
  });

  // Testar conexão
  const testMutation = useMutation({
    mutationFn: async (data: S3ConfigFormData) => {
      setTesting(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) throw new Error("Não autenticado");

      const response = await supabase.functions.invoke("test-s3-connection", {
        body: {
          endpoint: data.endpoint,
          region: data.region,
          bucket_name: data.bucket_name,
          access_key: data.access_key,
          secret_key: data.secret_key,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (result) => {
      setTesting(false);
      toast({
        title: result.success ? "Conexão bem-sucedida" : "Erro na conexão",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (error) => {
      setTesting(false);
      toast({
        title: "Erro ao testar conexão",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Deletar configuração
  const deleteMutation = useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase
        .from("storage_config")
        .delete()
        .eq("id", configId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Configuração deletada",
      });
      queryClient.invalidateQueries({ queryKey: ["storage_configs"] });
      if (selectedConfigId) setSelectedConfigId(null);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao deletar",
        variant: "destructive",
      });
    },
  });

  // Marcar como ativa
  const activateMutation = useMutation({
    mutationFn: async (configId: string) => {
      // Desativar todas as outras
      await supabase
        .from("storage_config")
        .update({ is_active: false })
        .neq("id", configId);

      // Ativar selecionada
      const { error } = await supabase
        .from("storage_config")
        .update({ is_active: true })
        .eq("id", configId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Configuração ativada",
      });
      queryClient.invalidateQueries({ queryKey: ["storage_configs"] });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao ativar",
        variant: "destructive",
      });
    },
  });

  const handleEditConfig = (config: StorageConfig) => {
    setSelectedConfigId(config.id);
    form.reset({
      name: config.name,
      description: config.description,
      provider: config.provider as any,
      endpoint: config.endpoint,
      region: config.region,
      bucket_name: config.bucket_name,
      access_key: config.access_key,
      secret_key: config.secret_key,
      path_prefix: config.path_prefix,
      signed_url_expiry_hours: config.signed_url_expiry_hours,
    });
  };

  const handleNewConfig = () => {
    setSelectedConfigId(null);
    form.reset();
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="form" className="w-full">
        <TabsList>
          <TabsTrigger value="form">
            {selectedConfigId ? "Editar Configuração" : "Nova Configuração"}
          </TabsTrigger>
          <TabsTrigger value="list">Configurações ({configs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedConfigId ? "Editar Configuração de Storage" : "Nova Configuração de Storage"}
              </CardTitle>
              <CardDescription>
                Configure uma conexão S3-compatível (Netskope, AWS S3, MinIO, etc)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome da Configuração</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: Netskope Principal" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="provider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="netskope">Netskope</SelectItem>
                              <SelectItem value="s3">AWS S3</SelectItem>
                              <SelectItem value="minio">MinIO</SelectItem>
                              <SelectItem value="wasabi">Wasabi</SelectItem>
                              <SelectItem value="backblaze">Backblaze B2</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição (opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Descrição da configuração" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="endpoint"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endpoint</FormLabel>
                          <FormControl>
                            <Input placeholder="https://storage.netskope.com" {...field} />
                          </FormControl>
                          <FormDescription>
                            URL completa do endpoint S3
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="region"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Região</FormLabel>
                          <FormControl>
                            <Input placeholder="us-east-1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="bucket_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Bucket</FormLabel>
                        <FormControl>
                          <Input placeholder="meu-bucket-facturas" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="access_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Access Key</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="AKIAIOSFODNN7EXAMPLE" {...field} />
                          </FormControl>
                          <FormDescription>
                            Será criptografado no banco de dados
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="secret_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Secret Key</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="wJalrXUtnFEMI/K7MDENG/K7MDENG/K7MDENG"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Será criptografado no banco de dados
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="path_prefix"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template de Caminho</FormLabel>
                        <FormControl>
                          <Input placeholder="{clientId}/{year}/{month}/{type}_{invoiceNumber}.pdf" {...field} />
                        </FormControl>
                        <FormDescription>
                          Use: {"{clientId"}, {"{year"}, {"{month"}, {"{type"}, {"{invoiceNumber"} como placeholders
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="signed_url_expiry_hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiração de URL Assinada (horas)</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" max="720" {...field} />
                        </FormControl>
                        <FormDescription>
                          Tempo de validade das URLs assinadas (1-720 horas)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => testMutation.mutate(form.getValues())}
                      disabled={testing || testMutation.isPending}
                    >
                      {testing || testMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Testando...
                        </>
                      ) : (
                        "Testar Conexão"
                      )}
                    </Button>

                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Configuração"
                      )}
                    </Button>

                    {selectedConfigId && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleNewConfig}
                      >
                        Nova Config
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          {configs.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Nenhuma configuração de storage criada. Crie uma nova na aba anterior.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {configs.map((config) => (
                <Card key={config.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{config.name}</CardTitle>
                          {config.is_active && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                              Ativa
                            </span>
                          )}
                        </div>
                        {config.description && (
                          <CardDescription className="mt-1">{config.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditConfig(config)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteMutation.mutate(config.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Provider:</span> {config.provider}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bucket:</span> {config.bucket_name}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Endpoint:</span> {config.endpoint}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Região:</span> {config.region}
                      </div>
                    </div>

                    {config.last_test_result && (
                      <div className="flex items-center gap-2 mt-2">
                        {config.last_test_result === "success" ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="text-xs text-green-600">
                              Último teste: sucesso em{" "}
                              {new Date(config.last_tested_at || "").toLocaleDateString()}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-600" />
                            <span className="text-xs text-red-600">
                              Último teste: erro em{" "}
                              {new Date(config.last_tested_at || "").toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {!config.is_active && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => activateMutation.mutate(config.id)}
                        className="mt-2"
                      >
                        Ativar Esta Configuração
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
