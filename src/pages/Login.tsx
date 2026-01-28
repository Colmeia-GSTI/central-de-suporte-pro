import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, Hexagon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function Login() {
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let emailToUse = loginIdentifier;
      
      // Verificar se é um username (não contém @)
      const isEmail = loginIdentifier.includes("@");
      
      if (!isEmail) {
        // Resolver username para email via edge function
        const { data, error: resolveError } = await supabase.functions.invoke("resolve-username", {
          body: { username: loginIdentifier },
        });

        if (resolveError || data?.error) {
          const errorMessage = data?.error || "Usuário não encontrado";
          toast({
            title: "Erro ao entrar",
            description: errorMessage,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        emailToUse = data.email;
      }

      const { error } = await signIn(emailToUse, password);

      if (error) {
        toast({
          title: "Erro ao entrar",
          description: error.message === "Invalid login credentials" ? "Usuário ou senha incorretos" : error.message,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      toast({ title: "Bem-vindo à Colmeia!", description: "Login realizado com sucesso." });
      navigate(from, { replace: true });
    } catch (error) {
      toast({
        title: "Erro ao entrar",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Hexagon Pattern Background */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03] dark:opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="login-hex" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
            <path d="M28 0L56 16.5V49.5L28 66L0 49.5V16.5L28 0Z M28 100L56 83.5V50.5L28 34L0 50.5V83.5L28 100Z" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-hex)" />
      </svg>

      {/* Floating Orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/15 blur-3xl"
        animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-accent/15 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, -50, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      {/* Login Card */}
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
                <Hexagon className="h-8 w-8 text-primary-foreground" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl -z-10" />
            </motion.div>
            
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <CardTitle className="text-2xl font-bold text-gradient">Colmeia</CardTitle>
              <CardDescription className="mt-2">Central de Atendimento</CardDescription>
            </motion.div>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="space-y-2">
                <Label htmlFor="loginIdentifier">Email ou Username</Label>
                <Input 
                  id="loginIdentifier" 
                  type="text" 
                  placeholder="seu@email.com ou usuario" 
                  value={loginIdentifier} 
                  onChange={(e) => setLoginIdentifier(e.target.value)} 
                  required 
                  autoComplete="username" 
                  className="bg-background/50" 
                />
              </motion.div>
              
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="bg-background/50 pr-10" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </motion.div>
            </CardContent>
            
            <CardFooter className="flex flex-col gap-4">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="w-full">
                <Button type="submit" className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground shadow-honey" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : "Entrar na Colmeia"}
                </Button>
              </motion.div>
              
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="text-sm text-muted-foreground">
                <Link to="/forgot-password" className="text-primary hover:underline font-medium">
                  Esqueci minha senha
                </Link>
              </motion.p>
              
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="text-sm text-muted-foreground">
                Não tem uma conta? <Link to="/register" className="text-primary hover:underline font-medium">Cadastre-se</Link>
              </motion.p>
            </CardFooter>
          </form>
        </Card>
        
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="text-center mt-6 text-xs text-muted-foreground/60">
          Powered by <span className="text-gradient font-semibold">Colmeia</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
