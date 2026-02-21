import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ColmeiaLogo } from "@/components/ui/ColmeiaLogo";
import { HoneycombLoader } from "@/components/ui/HoneycombLoader";
import { toast } from "sonner";
import { Shield, User, Mail, Lock, CheckCircle } from "lucide-react";
import { logger } from "@/lib/logger";

const setupSchema = z.object({
  full_name: z
    .string()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não conferem",
  path: ["confirmPassword"],
});

type SetupFormData = z.infer<typeof setupSchema>;

export default function Setup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  const form = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Check if system already has admins
  useEffect(() => {
    async function checkSystemStatus() {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("id")
          .eq("role", "admin")
          .limit(1);

        if (error) {
          logger.error("Error checking system status", "Setup", { error: error.message });
          toast.error("Erro ao verificar status do sistema");
          return;
        }

        if (data && data.length > 0) {
          toast.info("Sistema já configurado. Redirecionando para login...");
          navigate("/login", { replace: true });
          return;
        }
      } catch (err) {
        logger.error("Unexpected error checking system status", "Setup");
      } finally {
        setIsLoading(false);
      }
    }

    checkSystemStatus();
  }, [navigate]);

  async function onSubmit(data: SetupFormData) {
    setIsSubmitting(true);
    
    try {
      const { data: response, error } = await supabase.functions.invoke("bootstrap-admin", {
        body: {
          email: data.email,
          password: data.password,
          full_name: data.full_name,
        },
      });

      if (error) {
        logger.error("Bootstrap error", "Setup", { error: error.message });
        toast.error(error.message || "Erro ao criar administrador");
        return;
      }

      if (response?.error) {
        toast.error(response.error);
        return;
      }

      setSetupComplete(true);
      toast.success("Administrador criado com sucesso!");
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);
    } catch (err) {
      logger.error("Setup error", "Setup", { error: String(err) });
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <HoneycombLoader size="lg" />
      </div>
    );
  }

  if (setupComplete) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Setup Concluído!</CardTitle>
            <CardDescription>
              Administrador criado com sucesso. Redirecionando para o login...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HoneycombLoader size="sm" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto">
            <ColmeiaLogo size="lg" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              Configuração Inicial
            </CardTitle>
            <CardDescription>
              Crie o primeiro administrador do sistema para começar a usar a plataforma.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Nome Completo
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Seu nome completo" 
                        {...field} 
                        disabled={isSubmitting}
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
                    <FormLabel className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder="admin@empresa.com" 
                        {...field} 
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Senha
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Mínimo 8 caracteres" 
                        {...field} 
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Confirmar Senha
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Repita a senha" 
                        {...field} 
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <HoneycombLoader size="sm" className="mr-2" />
                    Criando administrador...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Criar Administrador
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground text-center">
              <strong>Segurança:</strong> Esta página só funciona quando o sistema não possui 
              administradores. Após criar o primeiro admin, use o login normal.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
