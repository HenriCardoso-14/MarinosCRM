create table clientes (
    id uuid primary key default gen_random_uuid(),
    matricula text,
    nome text not null,
    telefone text,
    data_nascimento date,
    data_cadastro date default current_date,
    observacoes text
);

create table planos (
    id serial primary key,
    nome text not null,
    valor decimal not null,
    ciclo_meses integer not null default 1
);

create table assinaturas (
    id serial primary key,
    cliente_id uuid references clientes(id),
    plano_id integer references planos(id),
    valor decimal not null,
    data_inicio date not null,
    data_vencimento date not null,
    situacao text not null default 'Ativo'
);

create table pagamentos_assinatura (
    id serial primary key,
    assinatura_id integer references assinaturas(id),
    data_pagamento date not null,
    valor decimal not null
);

create table servicos (
    id serial primary key,
    nome text not null,
    valor_padrao decimal
);

create table cortes (
    id serial primary key,
    cliente_id uuid references clientes(id),
    servico_id integer references servicos(id),
    produto_id integer references produtos(id),
    data date not null,
    valor decimal not null,
    tipo text not null -- 'Avulso' ou 'Assinatura'
);

create table produtos (
    id serial primary key,
    nome text not null,
    categoria text,
    quantidade integer default 0,
    valor_compra decimal,
    valor_venda decimal
);

create table movimentacoes (
    id serial primary key,
    descricao text,
    valor decimal not null,
    tipo text not null, -- 'Entrada' ou 'Saída'
    categoria text,
    data date not null
);

-- Dados Iniciais (Planos)
INSERT INTO planos (nome, valor, ciclo_meses) VALUES 
('Cabelo', 50.00, 1),
('Cabelo e Barba', 80.00, 1),
('Cabelo, Barba e Sobrancelha', 100.00, 1),
('Cabelo e Sobrancelha', 65.00, 1);

-- Dados Iniciais (Servicos)
INSERT INTO servicos (nome, valor_padrao) VALUES 
('Cabelo', 35.00),
('Barba', 35.00),
('Cabelo e Barba', 65.00),
('Cabelo e Sobrancelha', 45.00),
('Barba e Sobrancelha', 45.00),
('Cabelo, Barba e Sobrancelha', 80.00),
('Sobrancelha', 15.00),
('Depilação Nasal', 10.00);
