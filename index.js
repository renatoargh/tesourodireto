const jcrawler = require('jcrawler')
const cheerio = require('cheerio')
const TESOURO_DIRETO_URL = 'https://tesourodireto.bmfbovespa.com.br/portalinvestidor/'

const tesouroDireto = async (credenciais) => {
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

  return await crawler.each(credenciais, async (browser, page, credencial) => {
    // LOGIN
    await page.goto(TESOURO_DIRETO_URL)
    await page.waitFor('input#BodyContent_txtLogin')
    await page.type('input#BodyContent_txtLogin', credencial.login)
    await page.type('input#BodyContent_txtSenha', credencial.senha)
    await page.click('input#BodyContent_btnLogar')

    // EXTRATO
    await page.waitForNavigation({ waitUntil: 'load' })
    await page.goto(TESOURO_DIRETO_URL + '/extrato.aspx')
    await page.click('input#BodyContent_btnConsultar')
    await page.waitForSelector('#BodyContent_repSintetico_tblAgenteHeader_0')

    // PARSING
    const html = await page.content()
    const $ = cheerio.load(html)

    const resultados = []
    $('.section-container').each((index, element) => {
      const $corretora = cheerio.load(element)
      const resultado = {
        corretora: $corretora('p.title').text(),
        titulos: []
      }

      $corretora('table tbody tr').each((index, tr) => {
        const $tr = cheerio.load(tr)
        const dados = $tr('td').map((index, td) => {
          return $(td).text().trim()
        }).get()

        resultado.titulos.push({
          nome: dados[0],
          vencimento: dados[1],
          valorInvestido: dados[2],
          valorBrutoAtual: dados[3],
          valorLiquidoAtual: dados[4],
          quantidadeTotal: dados[5],
          quantidadeBloqueada: dados[6]
        })
      })

      resultados.push(resultado)
    })

    return resultados
  })
}

module.exports = tesouroDireto

// tesouroDireto({
//   login: 'cpf',
//   senha: 'senha'
// }).then(dados => {
//   console.log(JSON.stringify(dados, null, 4))
// })


