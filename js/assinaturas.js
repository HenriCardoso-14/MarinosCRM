let assinaturaModalInstance;
let renovarModalInstance;
let planosDisponiveis = [];

document.addEventListener('DOMContentLoaded', async () => {
    assinaturaModalInstance = new bootstrap.Modal(document.getElementById('assinaturaModal'));
    renovarModalInstance = new bootstrap.Modal(document.getElementById('renovarModal'));
    
    // Auto-calcula vencimento baseado no plano
    document.getElementById('assinaturaPlano').addEventListener('change', updatePlanoInfo);
    document.getElementById('assinaturaInicio').addEventListener('change', calculateVencimento);

    await Promise.all([loadClientesDropdown(), loadPlanos()]);
    loadAssinaturas();
});

async function loadClientesDropdown() {
    const { data, error } = await db.from('clientes').select('id, nome').order('nome');
    if (error) return console.error(error);
    const select = document.getElementById('assinaturaCliente');
    select.innerHTML = '<option value="">Selecione...</option>' + 
        data.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
}

async function loadPlanos() {
    const { data, error } = await db.from('planos').select('*');
    if (error) return console.error(error);
    planosDisponiveis = data;
    const select = document.getElementById('assinaturaPlano');
    select.innerHTML = '<option value="">Selecione...</option>' + 
        data.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
}

function updatePlanoInfo() {
    const planoId = document.getElementById('assinaturaPlano').value;
    if (!planoId) return;
    
    const plano = planosDisponiveis.find(p => p.id == planoId);
    if (plano) {
        document.getElementById('assinaturaValor').value = plano.valor;
        calculateVencimento();
    }
}

function calculateVencimento() {
    const inicioStr = document.getElementById('assinaturaInicio').value;
    const planoId = document.getElementById('assinaturaPlano').value;
    
    if (inicioStr && planoId) {
        const plano = planosDisponiveis.find(p => p.id == planoId);
        const dataInicio = new Date(inicioStr);
        // Supabase dates are YYYY-MM-DD, handling JS Date local timezone shift by adding time or using UTC
        dataInicio.setUTCHours(12); // avoid previous day bug
        
        const meses = plano.ciclo_meses || 1;
        dataInicio.setMonth(dataInicio.getMonth() + meses);
        
        document.getElementById('assinaturaVencimento').value = dataInicio.toISOString().split('T')[0];
    }
}

async function loadAssinaturas() {
    try {
        const { data: assinaturas, error } = await db
            .from('assinaturas')
            .select(`
                id, valor, data_inicio, data_vencimento, situacao,
                clientes (nome, telefone),
                planos (nome, ciclo_meses)
            `)
            .order('data_vencimento', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('assinaturas-tbody');
        if (assinaturas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nenhuma assinatura ativa.</td></tr>';
            return;
        }

        tbody.innerHTML = assinaturas.map(a => {
            const today = new Date().toISOString().split('T')[0];
            const isVencida = a.data_vencimento < today && a.situacao === 'Ativo';
            const badgeClass = a.situacao === 'Ativo' && !isVencida ? 'badge-active' : 'badge-inactive';
            const statusText = isVencida ? 'Atrasada' : a.situacao;

            return `
            <tr>
                <td class="fw-medium">${a.clientes.nome}</td>
                <td class="d-none d-md-table-cell">${a.planos.nome}</td>
                <td class="d-none d-md-table-cell">${formatCurrency(a.valor)}</td>
                <td>${formatDate(a.data_inicio)}</td>
                <td class="${isVencida ? 'text-danger fw-bold' : ''}">${formatDate(a.data_vencimento)}</td>
                <td><span class="${badgeClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-sm btn-glass text-success me-1" onclick="openRenovarModal('${a.id}', '${a.clientes.nome}', '${a.data_vencimento}', ${a.planos.ciclo_meses}, ${a.valor})" title="Renovar / Registrar Pagamento">
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                    <button class="btn btn-sm btn-glass text-accent me-1" onclick="editAssinatura('${a.id}')" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-glass text-danger" onclick="deleteAssinatura('${a.id}')" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar assinaturas.", "danger");
    }
}

function openAssinaturaModal() {
    document.getElementById('assinaturaForm').reset();
    document.getElementById('assinaturaId').value = '';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('assinaturaInicio').value = today;
    
    document.getElementById('assinaturaModalTitle').textContent = 'Nova Assinatura';
    assinaturaModalInstance.show();
}

async function editAssinatura(id) {
    try {
        const { data, error } = await db.from('assinaturas').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('assinaturaId').value = data.id;
        document.getElementById('assinaturaCliente').value = data.cliente_id;
        document.getElementById('assinaturaPlano').value = data.plano_id;
        document.getElementById('assinaturaValor').value = data.valor;
        document.getElementById('assinaturaInicio').value = data.data_inicio;
        document.getElementById('assinaturaVencimento').value = data.data_vencimento;
        document.getElementById('assinaturaStatus').value = data.situacao;

        document.getElementById('assinaturaModalTitle').textContent = 'Editar Assinatura';
        assinaturaModalInstance.show();
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar assinatura.", "danger");
    }
}

async function saveAssinatura() {
    const id = document.getElementById('assinaturaId').value;
    const payload = {
        cliente_id: document.getElementById('assinaturaCliente').value,
        plano_id: document.getElementById('assinaturaPlano').value,
        valor: document.getElementById('assinaturaValor').value,
        data_inicio: document.getElementById('assinaturaInicio').value,
        data_vencimento: document.getElementById('assinaturaVencimento').value,
        situacao: document.getElementById('assinaturaStatus').value
    };

    if (!payload.cliente_id || !payload.plano_id || !payload.data_inicio) {
        return showToast("Preencha todos os campos obrigatórios.", "warning");
    }

    try {
        let error;
        if (id) {
            ({ error } = await db.from('assinaturas').update(payload).eq('id', id));
        } else {
            // Nova assinatura, também registramos o primeiro pagamento na movimentacao e pagamentos_assinatura se quisermos
            const { data: novaAssinatura, error: errIns } = await db.from('assinaturas').insert([payload]).select('id').single();
            error = errIns;
            
            // Registrando pagamento inicial no financeiro
            if (!error && novaAssinatura) {
                await db.from('pagamentos_assinatura').insert([{
                    assinatura_id: novaAssinatura.id,
                    data_pagamento: payload.data_inicio,
                    valor: payload.valor
                }]);
                await db.from('movimentacoes').insert([{
                    descricao: `Assinatura - Primeiro Pagamento`,
                    valor: payload.valor,
                    tipo: 'Entrada',
                    categoria: 'Assinatura',
                    data: payload.data_inicio
                }]);
            }
        }

        if (error) throw error;
        showToast("Assinatura salva com sucesso!");
        assinaturaModalInstance.hide();
        loadAssinaturas();
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar assinatura.", "danger");
    }
}

async function deleteAssinatura(id) {
    if (!confirm("Tem certeza que deseja excluir esta assinatura?")) return;
    try {
        await db.from('pagamentos_assinatura').delete().eq('assinatura_id', id);
        const { error } = await db.from('assinaturas').delete().eq('id', id);
        if (error) throw error;
        showToast("Assinatura excluída.");
        loadAssinaturas();
    } catch (error) {
        console.error(error);
        showToast("Erro ao excluir assinatura.", "danger");
    }
}

function openRenovarModal(id, nomeCliente, dataVencimentoAtual, cicloMeses, valor) {
    const atual = new Date(dataVencimentoAtual);
    atual.setUTCHours(12);
    atual.setMonth(atual.getMonth() + cicloMeses);
    const novoVencimento = atual.toISOString().split('T')[0];

    document.getElementById('renovarId').value = id;
    document.getElementById('renovarValor').value = valor;
    document.getElementById('renovarNovoVencimento').value = novoVencimento;
    
    document.getElementById('renovarDetalhes').innerHTML = `
        Cliente: <strong>${nomeCliente}</strong><br>
        Novo Vencimento: <strong>${formatDate(novoVencimento)}</strong><br>
        Valor Pago: <strong>${formatCurrency(valor)}</strong>
    `;
    
    renovarModalInstance.show();
}

async function confirmarRenovacao() {
    const id = document.getElementById('renovarId').value;
    const novoVencimento = document.getElementById('renovarNovoVencimento').value;
    const valor = document.getElementById('renovarValor').value;
    const dataPagamento = new Date().toISOString().split('T')[0];

    try {
        // Atualiza a assinatura
        const { error: err1 } = await db.from('assinaturas')
            .update({ data_vencimento: novoVencimento, situacao: 'Ativo' })
            .eq('id', id);
        if (err1) throw err1;

        // Registra o pagamento em pagamentos_assinatura
        const { error: err2 } = await db.from('pagamentos_assinatura')
            .insert([{ assinatura_id: id, data_pagamento: dataPagamento, valor: valor }]);
        if (err2) throw err2;

        // Registra movimentação no financeiro
        const { error: err3 } = await db.from('movimentacoes')
            .insert([{
                descricao: `Renovação de Assinatura`,
                valor: valor,
                tipo: 'Entrada',
                categoria: 'Assinatura',
                data: dataPagamento
            }]);
        if (err3) throw err3;

        showToast("Renovação e pagamento registrados com sucesso!");
        renovarModalInstance.hide();
        loadAssinaturas();
    } catch (error) {
        console.error(error);
        showToast("Erro ao registrar renovação.", "danger");
    }
}
