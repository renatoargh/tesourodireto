const Big = require('big.js')
const Moment = require('moment')
const jcrawler = require('jcrawler')
const cheerio = require('cheerio')
const TESOURO_DIRETO_URL = 'https://tesourodireto.bmfbovespa.com.br/portalinvestidor/'

const noop = () => {}
const parseData = data => new Moment(data, 'DD/MM/YYYY').toDate()
const parseValor = valor => parseFloat(valor.replace(/\./g, '').replace(',', '.')) || null

const parseConta = texto => {
  const match = texto.match(/^(.*)\s-\s(.*)\s\(Conta ativa desde\s(.*)\)$/)

  if (!match) {
    return null
  }

  return {
    corretora: match[2],
    conta: match[1],
    ativaDesde: parseData(match[3])
  }
}


function obterValoresCalculados (titulo) {
  // VALORIZACAO
  const { valorInvestido, valorLiquidoAtual } = titulo
  let valorizacao = parseFloat(new Big(valorLiquidoAtual).div(valorInvestido).minus(1).round(6).valueOf())
  valorizacao = new Big(valorizacao).times(100).round(2).valueOf().replace('.', ',') + '%'
  if (!valorizacao.startsWith('-')) {
    valorizacao = '+' + valorizacao
  }

  // DIAS ATE O VENCIMENTO
  const hoje = new Moment()
  const diasAteVencimento = new Moment(titulo.vencimento).diff(hoje, 'days')

  // RESULTADO
  return { valorizacao, diasAteVencimento }
}

const tesouroDireto = async (credenciais, cb = noop) => {
  if (!Array.isArray(credenciais)) {
    credenciais = [credenciais]
  }

  const crawler = jcrawler({
    parser: 'puppeteer',
    concurrency: 1,
    rateLimit: 1000,
    retries: 1,
    retryInterval: 1000,
    backoff: 2,
    log: false
  })
  
  crawler
    .on('error', cb)
    .on('end', dados => cb(null, dados))

  return await crawler.each(credenciais, async (browser, page, credencial) => {
    // LOGIN
    await page.goto(TESOURO_DIRETO_URL, { timeout: 60000 })
    await page.waitFor('input#BodyContent_txtLogin')
    await page.type('input#BodyContent_txtLogin', credencial.login)
    await page.type('input#BodyContent_txtSenha', credencial.senha)
    await page.click('input#BodyContent_btnLogar')

    // EXTRATO
    // await page.waitForNavigation({ waitUntil: 'load' })
    await page.waitFor(30000)
    await page.goto(TESOURO_DIRETO_URL + '/extrato.aspx', { timeout: 60000 })
    await page.click('input#BodyContent_btnConsultar')
    await page.waitFor('.section-container', { timeout: 60000 })

    // PARSING
    const html = await page.content()
    const $ = cheerio.load(html)
    const titularNome = $('#Topo_lblNome').text().trim()

    const resultados = []
    $('.section-container').each((index, div) => {
      const $div = cheerio.load(div)
      const resultado = {
        titular: {
          nome: titularNome,
          cpf: credencial.login
        },
        conta: parseConta($div('p.title').text()),
        titulos: []
      }

      $div('table tbody tr').each((index, tr) => {
        const $tr = cheerio.load(tr)
        const dados = $tr('td').map((index, td) => {
          return $(td).text().trim()
        }).get()

        const titulo = {
          nome: dados[0],
          vencimento: parseData(dados[1]),
          valorInvestido: parseValor(dados[2]),
          valorBrutoAtual: parseValor(dados[3]),
          valorLiquidoAtual: parseValor(dados[4]),
          quantidadeTotal: parseValor(dados[5]),
          quantidadeBloqueada: parseValor(dados[6])
        }

        titulo.valoresCalculados = obterValoresCalculados(titulo)

        resultado.titulos.push(titulo)
      })

      resultados.push(resultado)
    })

    return resultados
  })
}

module.exports = tesouroDireto

const credenciais = require('./credenciais.js')
// tesouroDireto(credenciais, (err, dados) => {
tesouroDireto(credenciais).then(dados => {
  console.log(JSON.stringify(dados, null, 4))
}).catch(err => {
  console.log('err')
  console.log(err)
})
