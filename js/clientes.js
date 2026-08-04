let clienteModalInstance;
let historicoModalInstance;

document.addEventListener('DOMContentLoaded', () => {
    clienteModalInstance = new bootstrap.Modal(document.getElementById('clienteModal'));
    historicoModalInstance = new bootstrap.Modal(document.getElementById('historicoModal'));
    
    // Máscara simples para telefone
    const phoneInput = document.getElementById('clienteTelefone');
    phoneInput.addEventListener('input', function (e) {
        let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
        e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
    });

    loadClientes();
});

async function loadClientes() {
    try {
        const { data: clientes, error } = await db
            .from('clientes')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('clientes-tbody');
        
        if (clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum cliente cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = clientes.map(cliente => `
            <tr>
                <td class="text-muted fw-bold">#${cliente.matricula || '---'}</td>
                <td class="fw-medium">${cliente.nome}</td>
                <td>
                    ${cliente.telefone ? `
                    <a href="${getWhatsAppLink(cliente.telefone)}" target="_blank" class="text-success text-decoration-none">
                        <i class="fa-brands fa-whatsapp me-1"></i> ${cliente.telefone}
                    </a>
                    ` : '<span class="text-muted">Não informado</span>'}
                </td>
                <td>${formatDate(cliente.data_cadastro)}</td>
                <td>
                    <button class="btn btn-sm btn-glass text-accent me-2" onclick="editCliente('${cliente.id}')" title="Editar">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-sm btn-glass text-info me-2" onclick="openHistorico('${cliente.id}')" title="Histórico">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                    <button class="btn btn-sm btn-glass text-danger" onclick="deleteCliente('${cliente.id}')" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar clientes.", "danger");
    }
}

async function openClienteModal() {
    document.getElementById('clienteForm').reset();
    document.getElementById('clienteId').value = '';
    
    try {
        const { data, error } = await db.from('clientes').select('matricula').not('matricula', 'is', null);
        if (!error && data && data.length > 0) {
            const nums = data.map(c => parseInt(c.matricula)).filter(n => !isNaN(n));
            if (nums.length > 0) {
                const max = Math.max(...nums);
                document.getElementById('clienteMatricula').value = max + 1;
            } else {
                document.getElementById('clienteMatricula').value = 1;
            }
        } else {
            document.getElementById('clienteMatricula').value = 1;
        }
    } catch (e) {
        console.error(e);
    }
    
    document.getElementById('clienteModalTitle').textContent = 'Novo Cliente';
    clienteModalInstance.show();
}

async function editCliente(id) {
    try {
        const { data, error } = await db.from('clientes').select('*').eq('id', id).single();
        if (error) throw error;

        document.getElementById('clienteId').value = data.id;
        document.getElementById('clienteMatricula').value = data.matricula || '';
        document.getElementById('clienteNome').value = data.nome;
        document.getElementById('clienteTelefone').value = data.telefone || '';
        document.getElementById('clienteObs').value = data.observacoes || '';

        document.getElementById('clienteModalTitle').textContent = 'Editar Cliente';
        clienteModalInstance.show();
    } catch (error) {
        console.error(error);
        showToast("Erro ao carregar dados do cliente.", "danger");
    }
}

async function saveCliente() {
    const id = document.getElementById('clienteId').value;
    const matricula = document.getElementById('clienteMatricula').value.trim();
    const nome = document.getElementById('clienteNome').value.trim();
    const telefone = document.getElementById('clienteTelefone').value.trim();
    const observacoes = document.getElementById('clienteObs').value.trim();

    if (!nome) {
        showToast("O nome é obrigatório.", "warning");
        return;
    }
    
    // Validação de telefone (10 ou 11 digitos)
    const rawPhone = telefone.replace(/\D/g, '');
    if (rawPhone.length !== 10 && rawPhone.length !== 11) {
        showToast("Telefone inválido. Informe o DDD e o número completo.", "warning");
        return;
    }

    const payload = { 
        matricula: matricula ? matricula : null,
        nome, 
        telefone, 
        observacoes 
    };

    try {
        let error;
        if (id) {
            ({ error } = await db.from('clientes').update(payload).eq('id', id));
        } else {
            ({ error } = await db.from('clientes').insert([payload]));
        }

        if (error) throw error;

        showToast("Cliente salvo com sucesso!");
        clienteModalInstance.hide();
        loadClientes();
    } catch (err) {
        console.error(err);
        showToast("Erro ao salvar cliente.", "danger");
    }
}

async function deleteCliente(id) {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;

    try {
        const { error } = await db.from('clientes').delete().eq('id', id);
        if (error) throw error;
        
        showToast("Cliente excluído.");
        loadClientes();
    } catch (error) {
        console.error(error);
        showToast("Erro ao excluir cliente. Pode haver assinaturas vinculadas.", "danger");
    }
}

async function openHistorico(clienteId) {
    document.getElementById('historicoAssinatura').innerHTML = 'Carregando...';
    document.getElementById('historicoAtendimentos').innerHTML = '<tr><td colspan="4" class="text-center py-2 text-muted">Carregando...</td></tr>';
    historicoModalInstance.show();
    
    try {
        const { data: assData } = await db.from('assinaturas').select('*, planos(nome)').eq('cliente_id', clienteId).eq('situacao', 'Ativo').single();
        if (assData) {
            document.getElementById('historicoAssinatura').innerHTML = `
                <div class="p-3 rounded" style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border);">
                    <strong class="text-main">Plano:</strong> ${assData.planos.nome} <br>
                    <strong class="text-main">Vencimento:</strong> ${formatDate(assData.data_vencimento)} <br>
                    <strong class="text-main">Valor:</strong> ${formatCurrency(assData.valor)}
                </div>
            `;
        } else {
            document.getElementById('historicoAssinatura').innerHTML = '<p class="text-muted mb-0">Nenhuma assinatura ativa no momento.</p>';
        }

        const { data: cortesData, error } = await db.from('cortes').select(`
            *,
            servicos(nome),
            produtos(nome)
        `).eq('cliente_id', clienteId).order('data', { ascending: false }).order('id', { ascending: false });

        if (cortesData && cortesData.length > 0) {
            document.getElementById('historicoAtendimentos').innerHTML = cortesData.map(c => {
                const itemNome = c.servico_id ? (c.servicos ? c.servicos.nome : 'Serviço Excluído') : (c.produtos ? c.produtos.nome : 'Produto Excluído');
                return `
                <tr>
                    <td>${formatDate(c.data)}</td>
                    <td class="fw-medium">${itemNome}</td>
                    <td>${formatCurrency(c.valor)}</td>
                    <td><span class="badge ${c.tipo === 'Avulso' ? 'bg-secondary' : 'bg-primary'}">${c.tipo}</span></td>
                </tr>
            `}).join('');
        } else {
            document.getElementById('historicoAtendimentos').innerHTML = '<tr><td colspan="4" class="text-center py-2 text-muted">Nenhum atendimento registrado.</td></tr>';
        }

    } catch (e) {
        console.error(e);
        document.getElementById('historicoAssinatura').innerHTML = '<span class="text-danger">Erro ao carregar dados.</span>';
    }
}
