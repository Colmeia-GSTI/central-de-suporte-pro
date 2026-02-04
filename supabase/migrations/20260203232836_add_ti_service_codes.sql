-- Migration: Adicionar códigos tributários adicionais para serviços de TI/MSP
-- Baseado na Lei Complementar 116/2003 e suas alterações

-- Códigos adicionais de Informática (Item 1 da LC 116/2003)
INSERT INTO public.nfse_service_codes (codigo_tributacao, descricao, item_lista, subitem_lista, cnae_principal, aliquota_sugerida, categoria) VALUES

-- 1.03 - Processamento de dados e congêneres
('010301', 'Processamento, armazenamento ou hospedagem de dados, textos, imagens, vídeos, páginas eletrônicas, aplicativos e sistemas de informação', '1', '03.01', '6311900', 5.00, 'informatica'),
('010302', 'Elaboração de programas de computadores, inclusive de jogos eletrônicos', '1', '03.02', '6201501', 5.00, 'informatica'),
('010303', 'Armazenamento de dados em nuvem (cloud storage)', '1', '03.03', '6311900', 5.00, 'informatica'),
('010304', 'Backup e recuperação de dados', '1', '03.04', '6209100', 5.00, 'informatica'),

-- 1.04 - Programação e desenvolvimento
('010401', 'Desenvolvimento de software sob encomenda', '1', '04.01', '6201501', 5.00, 'informatica'),
('010402', 'Customização e parametrização de software', '1', '04.02', '6202300', 5.00, 'informatica'),
('010403', 'Integração de sistemas', '1', '04.03', '6204000', 5.00, 'informatica'),

-- 1.08 - Serviços Web
('010801', 'Desenvolvimento de websites e portais', '1', '08.01', '6201501', 5.00, 'informatica'),
('010802', 'Gestão de conteúdo web (CMS)', '1', '08.02', '6311900', 5.00, 'informatica'),
('010803', 'Otimização para motores de busca (SEO)', '1', '08.03', '6319400', 5.00, 'informatica'),

-- 1.09 - Cloud e SaaS
('010901', 'Software como Serviço (SaaS)', '1', '09.01', '6203100', 5.00, 'informatica'),
('010902', 'Infraestrutura como Serviço (IaaS)', '1', '09.02', '6311900', 5.00, 'informatica'),
('010903', 'Plataforma como Serviço (PaaS)', '1', '09.03', '6311900', 5.00, 'informatica'),

-- Serviços de Monitoramento e Segurança (Item 17)
('170301', 'Monitoramento de infraestrutura de TI', '17', '03.01', '6209100', 5.00, 'informatica'),
('170302', 'Gestão de segurança da informação', '17', '03.02', '6209100', 5.00, 'informatica'),
('170303', 'Auditoria de sistemas e segurança', '17', '03.03', '7020400', 5.00, 'consultoria'),
('170304', 'Gerenciamento de firewall e antivírus', '17', '03.04', '6209100', 5.00, 'informatica'),

-- Locação de Equipamentos (Item 3)
('030501', 'Locação de equipamentos de informática sem operador', '3', '05.01', '7733400', 5.00, 'locacao'),
('030502', 'Locação de servidores e infraestrutura', '3', '05.02', '7733400', 5.00, 'locacao'),

-- Serviços de Outsourcing/Terceirização de TI (Item 17)
('170401', 'Outsourcing de infraestrutura de TI', '17', '04.01', '6209100', 5.00, 'informatica'),
('170402', 'Outsourcing de helpdesk e suporte', '17', '04.02', '6209100', 5.00, 'informatica'),
('170403', 'Gestão de ativos de TI', '17', '04.03', '6209100', 5.00, 'informatica'),

-- Serviços de Comunicação e Rede (Item 1)
('011001', 'Configuração e administração de redes', '1', '10.01', '6209100', 5.00, 'informatica'),
('011002', 'Cabeamento estruturado e instalação de redes', '1', '10.02', '4321500', 5.00, 'informatica'),
('011003', 'Administração de servidores e datacenter', '1', '10.03', '6311900', 5.00, 'informatica'),

-- Serviços de E-mail e Colaboração
('011101', 'Hospedagem e gestão de e-mail corporativo', '1', '11.01', '6311900', 5.00, 'informatica'),
('011102', 'Implantação de ferramentas de colaboração', '1', '11.02', '6209100', 5.00, 'informatica'),

-- Migração e Implantação
('011201', 'Migração de sistemas e dados', '1', '12.01', '6209100', 5.00, 'informatica'),
('011202', 'Implantação de ERP e sistemas de gestão', '1', '12.02', '6202300', 5.00, 'informatica'),
('011203', 'Migração para nuvem (cloud migration)', '1', '12.03', '6209100', 5.00, 'informatica'),

-- Serviços de Impressão
('140701', 'Outsourcing de impressão', '14', '07.01', '8219901', 5.00, 'manutencao'),
('140702', 'Manutenção de impressoras e copiadoras', '14', '07.02', '9521500', 5.00, 'manutencao'),

-- Consultoria Especializada
('170501', 'Consultoria em transformação digital', '17', '05.01', '7020400', 5.00, 'consultoria'),
('170502', 'Consultoria em arquitetura de sistemas', '17', '05.02', '6204000', 5.00, 'consultoria'),
('170503', 'Consultoria em LGPD e compliance', '17', '05.03', '6920601', 5.00, 'consultoria'),
('170504', 'Planejamento estratégico de TI', '17', '05.04', '7020400', 5.00, 'consultoria'),

-- Treinamento em TI
('080202', 'Treinamento em sistemas e software', '8', '02.02', '8599603', 5.00, 'treinamento'),
('080203', 'Treinamento em segurança da informação', '8', '02.03', '8599603', 5.00, 'treinamento'),
('080204', 'Capacitação técnica em infraestrutura', '8', '02.04', '8599603', 5.00, 'treinamento')

ON CONFLICT (codigo_tributacao) DO NOTHING;

-- Comentário explicativo
COMMENT ON TABLE public.nfse_service_codes IS 'Códigos de serviço para emissão de NFS-e conforme LC 116/2003. Inclui códigos específicos para empresas de TI/MSP.';
