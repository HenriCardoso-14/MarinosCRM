let planosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Carregar planos para mapeamento
    const { data } = await db.from('planos').select('*');
    if (data) planosCache = data;
});

function logMsg(msg, isError = false) {
    const logEl = document.getElementById('importLog');
    const li = document.createElement('li');
    li.innerHTML = `<i class="fa-solid ${isError ? 'fa-xmark text-danger' : 'fa-check text-success'} me-2"></i> ${msg}`;
    logEl.prepend(li);
}

function updateProgress(percent) {
    const bar = document.getElementById('importProgressBar');
    bar.style.width = percent + '%';
    bar.textContent = Math.round(percent) + '%';
}

async function processarPlanilha() {
    const fileInput = document.getElementById('excelFile');
    if (!fileInput.files.length) {
        return showToast("Selecione um arquivo primeiro.", "warning");
    }

    document.getElementById('importStatus').style.display = 'block';
    document.getElementById('importLog').innerHTML = '';
    updateProgress(0);
    document.getElementById('btnImportar').disabled = true;

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async function(e) {
        try {
            logMsg("Lendo arquivo Excel...");
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Defval para garantir que colunas vazias não sejam ignoradas
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            
            if (rows.length === 0) {
                logMsg("A planilha está vazia.", true);
                document.getElementById('btnImportar').disabled = false;
                return;
            }

            logMsg(`${rows.length} linhas encontradas. Iniciando processamento...`);

            let progressStep = 100 / rows.length;
            let currentProgress = 0;

            for (let i = 0; i < rows.length; i++) {
                await processRow(rows[i], i + 1);
                currentProgress += progressStep;
                updateProgress(currentProgress);
            }

            updateProgress(100);
            logMsg("Importação finalizada com sucesso!");
            showToast("Importação finalizada!");

        } catch (err) {
            console.error(err);
            logMsg("Erro crítico ao processar planilha: " + err.message, true);
        } finally {
            document.getElementById('btnImportar').disabled = false;
        }
    };

    reader.readAsArrayBuffer(file);
}

function parseExcelDate(dateVal) {
    if (!dateVal) return null;
    
    // O SheetJS com cellDates: true transforma datas do Excel em objetos Date nativos
    if (dateVal instanceof Date) {
        return dateVal.toISOString().split('T')[0];
    }
    
    // Pode vir como string DD/MM/AAAA ou DD/MM/AA caso a célula esteja formatada como texto no Excel
    if (typeof dateVal === 'string') {
        const parts = dateVal.split('/');
        if (parts.length === 3) {
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }
    return null;
}

async function processRow(row, rowIndex) {
    const matriculaRaw = row['Matricula'] || row['Matrícula'] || row['MATRICULA'] || row['matricula'] || '';
    const matricula = String(matriculaRaw).trim();
    const nomeRaw = row['Nome'] || row['NOME'] || row['nome'];
    if (!nomeRaw) {
        logMsg(`Linha ${rowIndex}: Ignorada, coluna Nome vazia.`, true);
        return;
    }

    const nome = String(nomeRaw).trim();
    let telefone = String(row['Telefone'] || row['TELEFONE'] || row['telefone'] || '').trim();
    const planoName = String(row['Plano'] || row['PLANO'] || row['plano'] || '').trim();
    const dataInicioRaw = row['Data Inicio'] || row['Data Início'] || row['Data de inicio'] || row['DATA INICIO'] || row['data inicio'] || '';
    const valorRaw = row['Valor'] || row['VALOR'] || row['valor'] || '';
    const renovacaoRaw = row['Renovação'] || row['renovacao'] || row['renovação'] || row['Renovacao'] || row['RENOVAÇÃO'] || '';

    // Limpa telefone, deixando só números
    telefone = telefone.replace(/\D/g, '');

    // 1. Cadastrar Cliente ou buscar existente
    let clienteId;
    const { data: existingClients, error: extErr } = await db.from('clientes').select('id').ilike('nome', nome).limit(1);
    
    if (existingClients && existingClients.length > 0) {
        clienteId = existingClients[0].id;
        logMsg(`Linha ${rowIndex}: Cliente ${nome} já existe. Vinculando dados...`);
    } else {
        const { data: cliData, error: cliErr } = await db
            .from('clientes')
            .insert([{ matricula: matricula ? matricula : null, nome, telefone }])
            .select('id')
            .single();

        if (cliErr) {
            logMsg(`Linha ${rowIndex}: Erro ao inserir cliente ${nome} - ${cliErr.message}`, true);
            return;
        }
        clienteId = cliData.id;
        logMsg(`Linha ${rowIndex}: Cliente ${nome} inserido.`);
    }

    // 2. Verificar se tem Assinatura atrelada a preencher
    if (planoName && dataInicioRaw) {
        // Tenta achar o plano cadastrado no banco ignorando maiusculas/minusculas
        const planoMatch = planosCache.find(p => p.nome.toLowerCase() === planoName.toLowerCase());
        
        if (!planoMatch) {
            logMsg(`Linha ${rowIndex}: Plano "${planoName}" não encontrado no sistema. Vá na aba Planos e cadastre-o primeiro. Assinatura ignorada.`, true);
            return;
        }

        const dataInicio = parseExcelDate(dataInicioRaw);
        if (!dataInicio) {
            logMsg(`Linha ${rowIndex}: Data Inicio inválida para ${nome}. Assinatura ignorada.`, true);
            return;
        }

        // Calcula Vencimento
        let dataVencimento;
        if (renovacaoRaw) {
            dataVencimento = parseExcelDate(renovacaoRaw);
        }
        if (!dataVencimento) {
            const dInicio = new Date(dataInicio);
            dInicio.setUTCHours(12); // Previne problema de fuso horário voltar um dia
            dInicio.setMonth(dInicio.getMonth() + (planoMatch.ciclo_meses || 1));
            dataVencimento = dInicio.toISOString().split('T')[0];
        }

        // Parse do Valor
        let valorFinal = planoMatch.valor;
        if (valorRaw) {
            const valClean = String(valorRaw).replace('R$', '').replace(',', '.').trim();
            if (!isNaN(parseFloat(valClean))) {
                valorFinal = parseFloat(valClean);
            }
        }

        // Cria a assinatura
        const { error: assErr } = await db.from('assinaturas').insert([{
            cliente_id: clienteId,
            plano_id: planoMatch.id,
            valor: valorFinal,
            data_inicio: dataInicio,
            data_vencimento: dataVencimento,
            situacao: 'Ativo'
        }]);

        if (assErr) {
            logMsg(`Linha ${rowIndex}: Erro ao criar assinatura para ${nome} - ${assErr.message}`, true);
        } else {
            logMsg(`Linha ${rowIndex}: Assinatura do plano ${planoMatch.nome} (R$ ${valorFinal}) vinculada para ${nome}.`);
        }
    }
}
