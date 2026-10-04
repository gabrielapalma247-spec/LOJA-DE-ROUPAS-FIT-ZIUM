# Zium Fitness · Estoque e Vendas

Site estático (HTML + CSS + JS), sem build. Os dados ficam numa **planilha Google** (uma aba por tabela).

## 1. Criar a planilha (uma vez, ~5 min)
1. Crie uma planilha nova no Google Sheets (ex.: "Zium Estoque").
2. **Extensões → Apps Script**. Apague o que tiver lá e cole o conteúdo de `google-sheets/Code.gs`.
3. Na 1ª linha troque `TROQUE-ESTE-TOKEN` por uma senha longa inventada por você. Salve.
4. **Implantar → Nova implantação → tipo "App da Web"** → *Executar como:* **Eu** · *Quem tem acesso:* **Qualquer pessoa** → Implantar. Autorize quando pedir.
5. Copie o endereço que termina em `/exec`.
6. Abra `config.js` e preencha `url` (endereço) e `token` (a mesma senha do passo 3).

## 2. Publicar no Vercel
- **GitHub:** suba esta pasta num repositório → vercel.com/new → importe → *Framework Preset: Other* → Deploy.
- **CLI:** com Node instalado, dentro desta pasta: `npx vercel --prod`.

Primeiro acesso: usuário `admin`, senha `zium123` (troque em "Trocar senha").

## Observações
- Altere dados **pelo sistema**; a planilha é o armazenamento (as abas são legíveis e dá para filtrar/baixar, mas edição manual nas células é ignorada — vale a coluna `_json`).
- Se alguém mudar o Code.gs depois, faça **Implantar → Gerenciar implantações → editar → nova versão**.
- Sem `url`/`token` no `config.js`, o sistema funciona só no navegador (modo local).
- O token fica visível no código do site e o login roda no navegador: é uma trava de uso, não segurança forte. Não compartilhe o link do site. Para proteger de verdade, ative *Password Protection* no Vercel.
