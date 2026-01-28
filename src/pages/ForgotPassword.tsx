import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Hexagon, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [noEmail, setNoEmail] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNoEmail(false);

    try {
      const { data, error } = await supabase.functions.invoke("forgot-password", {
        body: { identifier },
      });

      if (error) {
        toast({
          title: "Erro",
          description: "Não foi possível processar sua solicitação. Tente novamente.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      if (data?.error) {
        if (data.noEmail) {
          setNoEmail(true);
        } else {
          toast({
            title: "Erro",
            description: data.error,
            variant: "destructive",
          });
        }
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      toast({
        title: "Erro",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Hexagon Pattern Background */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03] dark:opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="forgot-hex" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
            <path d="M28 0L56 16.5V49.5L28 66L0 49.5V16.5L28 0Z M28 100L56 83.5V50.5L28 34L0 50.5V83.5L28 100Z" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#forgot-hex)" />
      </svg>

      {/* Floating Orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/15 blur-3xl"
        animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md p-4"
      >
        <Card className="backdrop-blur-xl bg-card/80 border-border/50 shadow-2xl">
          <CardHeader className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
              className="relative mx-auto"
            >
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-honey">
                {success ? (
                  <CheckCircle className="h-8 w-8 text-primary-foreground" />
                ) : noEmail ? (
                  <AlertCircle className="h-8 w-8 text-primary-foreground" />
                ) : (
                  <Hexagon className="h-8 w-8 text-primary-foreground" />
                )}
              </div>
              <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl -z-10" />
            </motion.div>
            
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <CardTitle className="text-2xl font-bold">
                {success ? "Email Enviado!" : noEmail ? "Sem Email Cadastrado" : "Recuperar Senha"}
              </CardTitle>
              <CardDescription className="mt-2">
                {success 
                  ? "Verifique sua caixa de entrada e siga as instruções enviadas."
                  : noEmail
                  ? "Não foi possível enviar a recuperação por email."
                  : "Informe seu email ou username para recuperar sua senha."
                }
              </CardDescription>
            </motion.div>
          </CardHeader>

          {!success && !noEmail && (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="space-y-2">
                  <Label htmlFor="identifier">Email ou Username</Label>
                  <Input 
                    id="identifier" 
                    type="text" 
                    placeholder="seu@email.com ou usuario" 
                    value={identifier} 
                    onChange={(e) => setIdentifier(e.target.value)} 
                    required 
                    className="bg-background/50" 
                  />
                </motion.div>
              </CardContent>
              
              <CardFooter className="flex flex-col gap-4">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="w-full">
                  <Button type="submit" className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground shadow-honey" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Enviar Recuperação
                      </>
                    )}
                  </Button>
                </motion.div>
              </CardFooter>
            </form>
          )}

          {noEmail && (
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Este usuário não possui email cadastrado para recuperação de senha.
              </p>
              <p className="text-sm text-muted-foreground">
                Entre em contato com o suporte técnico para solicitar uma nova senha.
              </p>
            </CardContent>
          )}

          <div className="px-6 pb-6">
            <Link to="/login">
              <Button variant="ghost" className="w-full gap-2">
                <ArrowLeft className="h-4 w-4" />
                Voltar para o Login
              </Button>
            </Link>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
