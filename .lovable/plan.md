

# Plano: Aplicar Categorias e SLAs Sugeridos

## Resumo

Vou inserir as 10 categorias de tickets e as 4 configurações de SLA padrão diretamente no banco de dados para um MSP de TI.

---

## Dados a Inserir

### Categorias de Tickets (10)

| Categoria | Descrição | SLA Padrão |
|-----------|-----------|------------|
| Infraestrutura | Servidores, storage, virtualização, rede física | 8h |
| Segurança | Antivírus, firewall, acessos, incidentes de segurança | 4h |
| E-mail e Colaboração | Microsoft 365, Google Workspace, Zoom, Teams | 8h |
| Sistemas e Aplicações | ERPs, sistemas de gestão, software de terceiros | 12h |
| Backup e Recuperação | Rotinas de backup, restore, disaster recovery | 4h |
| Suporte ao Usuário | Dúvidas, reset de senha, configuração de estação | 16h |
| Impressão | Impressoras, scanners, problemas de impressão | 24h |
| Conectividade | Internet, VPN, Wi-Fi, links de dados | 4h |
| Hardware | Equipamentos, periféricos, manutenção física | 24h |
| Projetos e Melhorias | Implementações, upgrades, novos serviços | 48h |

### Configurações de SLA (4 prioridades)

| Prioridade | Resposta | Resolução | Descrição |
|------------|----------|-----------|-----------|
| Crítica | 0.5h | 4h | Serviço parado, impacto total |
| Alta | 2h | 8h | Impacto significativo, workaround possível |
| Média | 4h | 24h | Impacto moderado, operação continua |
| Baixa | 8h | 48h | Sem impacto imediato, melhorias |

---

## Etapas de Implementação

### Etapa 1: Inserir Categorias
Executar INSERT na tabela `ticket_categories` com as 10 categorias.

### Etapa 2: Inserir SLAs
Executar INSERT na tabela `sla_configs` com as 4 configurações de prioridade padrão (sem cliente ou categoria específica = aplicável a todos).

---

## Detalhes Técnicos

### SQL de Inserção

```sql
-- Categorias
INSERT INTO ticket_categories (name, description, sla_hours, is_active) VALUES
('Infraestrutura', 'Servidores, storage, virtualização, rede física', 8, true),
('Segurança', 'Antivírus, firewall, acessos, incidentes de segurança', 4, true),
('E-mail e Colaboração', 'Microsoft 365, Google Workspace, Zoom, Teams', 8, true),
('Sistemas e Aplicações', 'ERPs, sistemas de gestão, software de terceiros', 12, true),
('Backup e Recuperação', 'Rotinas de backup, restore, disaster recovery', 4, true),
('Suporte ao Usuário', 'Dúvidas, reset de senha, configuração de estação', 16, true),
('Impressão', 'Impressoras, scanners, problemas de impressão', 24, true),
('Conectividade', 'Internet, VPN, Wi-Fi, links de dados', 4, true),
('Hardware', 'Equipamentos, periféricos, manutenção física', 24, true),
('Projetos e Melhorias', 'Implementações, upgrades, novos serviços', 48, true);

-- SLAs padrão por prioridade
INSERT INTO sla_configs (priority, response_hours, resolution_hours) VALUES
('critical', 1, 4),
('high', 2, 8),
('medium', 4, 24),
('low', 8, 48);
```

---

## Resultado Esperado

Após a execução:
- A aba **Categorias** mostrará as 10 categorias com seus SLAs padrão
- A aba **SLA** mostrará as 4 configurações de tempo por prioridade
- O sistema estará pronto para classificar tickets de forma adequada para um MSP

