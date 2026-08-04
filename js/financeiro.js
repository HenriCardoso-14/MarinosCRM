let movModalInstance;
let dataInicioFiltro = null;
let dataFimFiltro = null;

document.addEventListener('DOMContentLoaded', () => {
    movModalInstance = new bootstrap.Modal(document.getElementById('movimentacaoModal'));
    
    // Configura filtro inicial para o mês atual
    const today = new Date();
    const ano = today.getFullYear();
    const mes = String(today.getMonth() + 1).padStart(2, '0');
    document.getElementById('filtroMes').value = `${ano}-${mes}`;
    
    aplicarFiltro();
});

function aplicarFiltro() {
    const val = document.getElementById('filtroMes').value;
    if (val) {
        const [ano, mes] = val.split('-');
        dataInicioFiltro = `${ano}-${mes}-01`;
        // Para pegar o ultimo dia do mes
        const ultimoDia = new Date(ano, mes, 0).getDate();
        dataFimFiltro = `${ano}-${mes}-${ultimoDia}`;
    } else {
        dataInicioFiltro = null;
        dataFimFiltro = null;
    }
    loadFinanceiro();
}

async function loadFinanceiro() {
    try {
        let query = db.from('movimentacoes').select('*').order('data', { ascending: false }).order('id', { ascending: false });
        
        if (dataInicioFiltro && dataFimFiltro) {
            query = query.gte('data', dataInicioFiltro).lte('data', dataFimFiltro);
        }

        const { data: movimentacoes, error } = await query;
        if (error) throw error;

        let totalEntradas = 0;
        let totalSaidas = 0;

        const tbody = document.getElementById('financeiro-tbody');
        if (movimentacoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma movimentação neste período.</td></tr>';
        } else {
            tbody.innerHTML = movimentacoes.map(m => {
                if (m.tipo === 'Entrada') totalEntradas += parseFloat(m.valor);
                else if (m.tipo === 'Saída') totalSaidas += parseFloat(m.valor);

                const color = m.tipo === 'Entrada' ? 'text-success' : 'text-danger';
                return `
                <tr>
                    <td>${formatDate(m.data)}</td>
                    <td class="fw-medium">${m.descricao}</td>
                    <td>${m.categoria || '-'}</td>
                    <td><span class="${color} fw-bold">${m.tipo}</span></td>
                    <td class="${color}">${formatCurrency(m.valor)}</td>
                    <td>
                        <button class="btn btn-sm btn-glass text-accent me-1" onclick="editMovimentacao('${m.id}')" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-glass text-danger" onclick="deleteMovimentacao('${m.id}')" title="Excluir">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `}).join('');
        }

        const lucro = totalEntradas - totalSaidas;
        document.getElementById('total-entradas').textContent = formatCurrency(totalEntradas);
        document.getElementById('total-saidas').textContent = formatCurrency(totalSaidas);
        document.getElementById('lucro-liquido').textContent = formatCurrency(lucro);
        
        const cardLucro = document.getElementById('lucro-liquido').parentElement;
        if (lucro < 0) {
            cardLucro.className = 'glass-card p-4 border-danger text-danger';
        } else {
            cardLucro.className = 'glass-card p-4 border-accent text-accent'; // ou text-success
        }

    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar dados financeiros.", "danger");
    }
}

function openMovimentacaoModal() {
    document.getElementById('movimentacaoForm').reset();
    document.getElementById('movId').value = '';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('movData').value = today;
    
    document.getElementById('movModalTitle').textContent = 'Nova Movimentação';
    movModalInstance.show();
}

async function editMovimentacao(id) {
    try {
        const { data, error } = await db.from('movimentacoes').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('movId').value = data.id;
        document.getElementById('movData').value = data.data;
        document.getElementById('movDescricao').value = data.descricao;
        document.getElementById('movTipo').value = data.tipo;
        document.getElementById('movCategoria').value = data.categoria || '';
        document.getElementById('movValor').value = data.valor;

        document.getElementById('movModalTitle').textContent = 'Editar Movimentação';
        movModalInstance.show();
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar movimentação.", "danger");
    }
}

async function saveMovimentacao() {
    const id = document.getElementById('movId').value;
    const payload = {
        data: document.getElementById('movData').value,
        descricao: document.getElementById('movDescricao').value.trim(),
        tipo: document.getElementById('movTipo').value,
        categoria: document.getElementById('movCategoria').value.trim(),
        valor: document.getElementById('movValor').value
    };

    if (!payload.data || !payload.descricao || !payload.valor) {
        return showToast("Preencha os campos obrigatórios.", "warning");
    }

    try {
        let error;
        if (id) {
            ({ error } = await db.from('movimentacoes').update(payload).eq('id', id));
        } else {
            ({ error } = await db.from('movimentacoes').insert([payload]));
        }

        if (error) throw error;

        showToast("Movimentação salva com sucesso!");
        movModalInstance.hide();
        loadFinanceiro();
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar movimentação.", "danger");
    }
}

async function deleteMovimentacao(id) {
    if (!confirm("Tem certeza que deseja excluir esta movimentação?")) return;
    try {
        const { error } = await db.from('movimentacoes').delete().eq('id', id);
        if (error) throw error;
        showToast("Movimentação excluída.");
        loadFinanceiro();
    } catch (error) {
        console.error(error);
        showToast("Erro ao excluir.", "danger");
    }
}
