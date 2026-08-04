let produtoModalInstance;
let venderModalInstance;

document.addEventListener('DOMContentLoaded', () => {
    produtoModalInstance = new bootstrap.Modal(document.getElementById('produtoModal'));
    venderModalInstance = new bootstrap.Modal(document.getElementById('venderModal'));
    loadProdutos();
});

async function loadProdutos() {
    try {
        const { data: produtos, error } = await db
            .from('produtos')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('produtos-tbody');
        if (produtos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhum produto cadastrado no estoque.</td></tr>';
            return;
        }

        tbody.innerHTML = produtos.map(p => {
            const estoqueBaixo = p.quantidade <= 3 ? 'text-warning fw-bold' : '';
            return `
            <tr>
                <td class="fw-medium">${p.nome}</td>
                <td>${p.categoria || '-'}</td>
                <td class="${estoqueBaixo}">${p.quantidade} un</td>
                <td class="d-none d-md-table-cell">${formatCurrency(p.valor_compra)}</td>
                <td>${formatCurrency(p.valor_venda)}</td>
                <td>
                    <button class="btn btn-sm btn-glass text-success me-1" onclick="openVenderModal('${p.id}', '${p.nome}', ${p.valor_venda}, ${p.quantidade})" title="Registrar Venda" ${p.quantidade <= 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-cart-shopping"></i>
                    </button>
                    <button class="btn btn-sm btn-glass text-accent me-1" onclick="editProduto('${p.id}')" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-glass text-danger" onclick="deleteProduto('${p.id}')" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar produtos.", "danger");
    }
}

function openProdutoModal() {
    document.getElementById('produtoForm').reset();
    document.getElementById('produtoId').value = '';
    document.getElementById('produtoModalTitle').textContent = 'Novo Produto';
    produtoModalInstance.show();
}

async function editProduto(id) {
    try {
        const { data, error } = await db.from('produtos').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('produtoId').value = data.id;
        document.getElementById('produtoNome').value = data.nome;
        document.getElementById('produtoCategoria').value = data.categoria || '';
        document.getElementById('produtoQuantidade').value = data.quantidade;
        document.getElementById('produtoCompra').value = data.valor_compra;
        document.getElementById('produtoVenda').value = data.valor_venda;

        document.getElementById('produtoModalTitle').textContent = 'Editar Produto';
        produtoModalInstance.show();
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar dados do produto.", "danger");
    }
}

async function saveProduto() {
    const id = document.getElementById('produtoId').value;
    const payload = {
        nome: document.getElementById('produtoNome').value.trim(),
        categoria: document.getElementById('produtoCategoria').value.trim(),
        quantidade: document.getElementById('produtoQuantidade').value || 0,
        valor_compra: document.getElementById('produtoCompra').value || 0,
        valor_venda: document.getElementById('produtoVenda').value || 0
    };

    if (!payload.nome) return showToast("O nome é obrigatório.", "warning");

    try {
        let error;
        if (id) {
            ({ error } = await db.from('produtos').update(payload).eq('id', id));
        } else {
            ({ error } = await db.from('produtos').insert([payload]));
        }

        if (error) throw error;

        showToast("Produto salvo no estoque!");
        produtoModalInstance.hide();
        loadProdutos();
    } catch (error) {
        console.error(error);
        showToast("Erro ao salvar produto.", "danger");
    }
}

async function deleteProduto(id) {
    if (!confirm("Tem certeza que deseja excluir este produto do estoque?")) return;
    try {
        const { error } = await db.from('produtos').delete().eq('id', id);
        if (error) throw error;
        showToast("Produto excluído.");
        loadProdutos();
    } catch (error) {
        console.error(error);
        showToast("Erro ao excluir.", "danger");
    }
}

let venderValorUnitario = 0;
function openVenderModal(id, nome, valor_venda, estoque) {
    document.getElementById('venderId').value = id;
    document.getElementById('venderNome').textContent = nome;
    document.getElementById('venderEstoqueAtual').value = estoque;
    
    document.getElementById('venderQtd').value = 1;
    document.getElementById('venderQtd').max = estoque;
    
    venderValorUnitario = valor_venda;
    document.getElementById('venderValor').value = valor_venda;
    
    // Atualiza valor total ao mudar qtd
    document.getElementById('venderQtd').addEventListener('input', (e) => {
        document.getElementById('venderValor').value = (e.target.value * venderValorUnitario).toFixed(2);
    });
    
    venderModalInstance.show();
}

async function confirmarVenda() {
    const id = document.getElementById('venderId').value;
    const nome = document.getElementById('venderNome').textContent;
    const qtd = parseInt(document.getElementById('venderQtd').value);
    const estoqueAtual = parseInt(document.getElementById('venderEstoqueAtual').value);
    const valor = parseFloat(document.getElementById('venderValor').value);
    const hoje = new Date().toISOString().split('T')[0];

    if (qtd > estoqueAtual) {
        return showToast("Quantidade maior que o estoque disponível.", "warning");
    }

    try {
        // Atualiza estoque
        const { error: err1 } = await db.from('produtos').update({ quantidade: estoqueAtual - qtd }).eq('id', id);
        if (err1) throw err1;

        // Lança movimentação
        const { error: err2 } = await db.from('movimentacoes').insert([{
            descricao: `Venda de Produto: ${nome} (${qtd}x)`,
            valor: valor,
            tipo: 'Entrada',
            categoria: 'Produto',
            data: hoje
        }]);
        if (err2) throw err2;

        showToast("Venda registrada e estoque atualizado!");
        venderModalInstance.hide();
        loadProdutos();
    } catch (error) {
        console.error(error);
        showToast("Erro ao registrar venda.", "danger");
    }
}
