let corteModalInstance;
let servicosDisponiveis = [];
let produtosDisponiveis = [];
let assinaturasAtivas = []; // para verificar se o cliente tem assinatura
let carrinho = [];

document.addEventListener('DOMContentLoaded', () => {
    corteModalInstance = new bootstrap.Modal(document.getElementById('corteModal'));
    loadClientesDropdown();
    loadServicosDropdown();
    loadProdutosDropdown();
    loadCortes();
});

async function loadClientesDropdown() {
    const { data, error } = await db.from('clientes').select('id, nome').order('nome');
    if (error) return console.error(error);
    const select = document.getElementById('corteCliente');
    select.innerHTML = '<option value="">Sem Cadastro (Avulso)</option>' + 
        data.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        
    // Pré-carrega assinaturas para saber se tem cobertura
    const { data: assData } = await db.from('assinaturas').select('cliente_id').eq('situacao', 'Ativo');
    if (assData) assinaturasAtivas = assData.map(a => a.cliente_id);
}

function checkAssinaturaAtiva() {
    const clienteId = document.getElementById('corteCliente').value;
    const div = document.getElementById('statusAssinatura');
    if (clienteId && assinaturasAtivas.includes(clienteId)) {
        div.innerHTML = '<i class="fa-solid fa-star me-1"></i> Cliente possui Assinatura Ativa (Serviços serão isentos).';
    } else {
        div.innerHTML = '';
    }
    renderCarrinho(); // re-render para recalcular isenções
}

async function loadServicosDropdown() {
    const { data, error } = await db.from('servicos').select('*').order('nome');
    if (error) return console.error(error);
    servicosDisponiveis = data;
    const select = document.getElementById('selectServico');
    select.innerHTML = '<option value="">+ Adicionar Serviço...</option>' + 
        data.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
}

async function loadProdutosDropdown() {
    const { data, error } = await db.from('produtos').select('*').gt('quantidade', 0).order('nome');
    if (error) return console.error(error);
    produtosDisponiveis = data;
    const select = document.getElementById('selectProduto');
    select.innerHTML = '<option value="">+ Adicionar Produto...</option>' + 
        data.map(p => `<option value="${p.id}">${p.nome} (${p.quantidade} un) - ${formatCurrency(p.valor_venda)}</option>`).join('');
}

async function loadCortes() {
    try {
        const { data: cortes, error } = await db
            .from('cortes')
            .select(`
                id, data, valor, tipo,
                clientes(nome),
                servicos(nome),
                produtos(nome)
            `)
            .order('data', { ascending: false })
            .order('id', { ascending: false });

        if (error) throw error;

        const tbody = document.getElementById('cortes-tbody');
        
        if (cortes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum atendimento registrado.</td></tr>';
            return;
        }

        tbody.innerHTML = cortes.map(corte => {
            const cliente = corte.clientes ? corte.clientes.nome : 'Avulso';
            const itemNome = corte.servicos ? corte.servicos.nome : (corte.produtos ? corte.produtos.nome : 'Desconhecido/Excluído');
            const colorTipo = corte.tipo === 'Avulso' ? 'bg-secondary' : 'bg-primary';
            return `
            <tr>
                <td>${formatDate(corte.data)}</td>
                <td class="fw-medium">${cliente}</td>
                <td>${itemNome}</td>
                <td><span class="badge ${colorTipo}">${corte.tipo}</span></td>
                <td>${formatCurrency(corte.valor)}</td>
                <td>
                    <button class="btn btn-sm btn-glass text-danger" onclick="deleteCorte('${corte.id}')" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar histórico.", "danger");
    }
}

function openCorteModal() {
    document.getElementById('corteCliente').value = '';
    document.getElementById('corteData').value = new Date().toISOString().split('T')[0];
    document.getElementById('statusAssinatura').innerHTML = '';
    carrinho = [];
    renderCarrinho();
    corteModalInstance.show();
}

function addServico() {
    const id = document.getElementById('selectServico').value;
    if (!id) return;
    const serv = servicosDisponiveis.find(s => s.id == id);
    if (serv) {
        carrinho.push({
            tipo_item: 'servico',
            id: serv.id,
            nome: serv.nome,
            valor_base: serv.valor_padrao
        });
        document.getElementById('selectServico').value = '';
        renderCarrinho();
    }
}

function addProduto() {
    const id = document.getElementById('selectProduto').value;
    if (!id) return;
    const prod = produtosDisponiveis.find(p => p.id == id);
    if (prod) {
        carrinho.push({
            tipo_item: 'produto',
            id: prod.id,
            nome: prod.nome,
            valor_base: prod.valor_venda
        });
        document.getElementById('selectProduto').value = '';
        renderCarrinho();
    }
}

function removeCarrinho(index) {
    carrinho.splice(index, 1);
    renderCarrinho();
}

function renderCarrinho() {
    const tbody = document.getElementById('carrinhoTbody');
    const clienteId = document.getElementById('corteCliente').value;
    const isAssinante = clienteId && assinaturasAtivas.includes(clienteId);
    
    let total = 0;

    if (carrinho.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-muted">Carrinho vazio</td></tr>';
        document.getElementById('carrinhoTotal').textContent = formatCurrency(0);
        return;
    }

    tbody.innerHTML = carrinho.map((item, index) => {
        let valorFinal = item.valor_base;
        let tipoCobranca = 'Avulso';
        
        // Se for serviço E o cliente for assinante, o valor é zero. (Produtos sempre são cobrados)
        if (item.tipo_item === 'servico' && isAssinante) {
            valorFinal = 0;
            tipoCobranca = 'Assinatura';
        }

        total += parseFloat(valorFinal);

        return `
        <tr>
            <td>${item.nome} <small class="text-muted">(${item.tipo_item})</small></td>
            <td><span class="badge ${tipoCobranca === 'Avulso' ? 'bg-secondary' : 'bg-primary'}">${tipoCobranca}</span></td>
            <td>${formatCurrency(valorFinal)}</td>
            <td>
                <button class="btn btn-sm text-danger" onclick="removeCarrinho(${index})"><i class="fa-solid fa-xmark"></i></button>
            </td>
        </tr>
    `}).join('');

    document.getElementById('carrinhoTotal').textContent = formatCurrency(total);
}

async function salvarAtendimento() {
    if (carrinho.length === 0) {
        return showToast("Adicione ao menos um item no carrinho.", "warning");
    }

    const clienteId = document.getElementById('corteCliente').value || null;
    const isAssinante = clienteId && assinaturasAtivas.includes(clienteId);
    const data = document.getElementById('corteData').value;
    
    if (!data) return showToast("A data é obrigatória.", "warning");
    if (data.split('-')[0].length > 4) return showToast("Data inválida. Verifique o ano.", "warning");

    try {
        let totalFinanceiro = 0;
        const nomesItens = [];

        for (const item of carrinho) {
            let valorFinal = item.valor_base;
            let tipo = 'Avulso';
            
            if (item.tipo_item === 'servico' && isAssinante) {
                valorFinal = 0;
                tipo = 'Assinatura';
            }
            
            totalFinanceiro += parseFloat(valorFinal);
            nomesItens.push(item.nome);

            const payload = {
                cliente_id: clienteId,
                data: data,
                valor: valorFinal,
                tipo: tipo
            };

            if (item.tipo_item === 'servico') {
                payload.servico_id = item.id;
            } else {
                payload.produto_id = item.id;
                
                // Reduzir estoque no BD
                const prodDb = produtosDisponiveis.find(p => p.id == item.id);
                if (prodDb) {
                    await db.from('produtos').update({ quantidade: prodDb.quantidade - 1 }).eq('id', item.id);
                }
            }

            const { error } = await db.from('cortes').insert([payload]);
            if (error) throw error;
        }

        if (totalFinanceiro > 0) {
            await db.from('movimentacoes').insert([{
                descricao: `Atendimento PDV: ${nomesItens.join(', ')}`,
                valor: totalFinanceiro,
                tipo: 'Entrada',
                categoria: 'Atendimentos',
                data: data
            }]);
        }

        showToast("Atendimento finalizado com sucesso!");
        corteModalInstance.hide();
        loadCortes();
        loadProdutosDropdown(); // recarrega dropdown de produtos para atualizar quantidades
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar atendimento.", "danger");
    }
}

async function deleteCorte(id) {
    if (!confirm("Excluir este item do histórico? (Isso não desfará a movimentação financeira nem devolverá estoque).")) return;
    try {
        const { error } = await db.from('cortes').delete().eq('id', id);
        if (error) throw error;
        showToast("Item excluído.");
        loadCortes();
    } catch (error) {
        console.error(error);
        showToast("Erro ao excluir.", "danger");
    }
}
