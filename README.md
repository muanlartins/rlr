# RLR

Rocket League Replay: um player 3D de replays do Rocket League, feito para
gravar vídeos por cima deles. Solte um arquivo `.replay` e assista à partida de
qualquer lugar, pela câmera de qualquer jogador, pause, avance quadro a quadro
e desenhe sobre o momento congelado.

No ar em [muanlartins.com.br/rlr](https://muanlartins.com.br/rlr/) (também em
[muanlartins.com/rlr](https://muanlartins.com/rlr/) e
[muanlartins.github.io/rlr](https://muanlartins.github.io/rlr/)).

## Como usar

```sh
./run.sh
```

Ele instala o que faltar, sobe o servidor de desenvolvimento na porta 5180 e
abre a página. Aí é só soltar um arquivo `.replay` na página, ou abrir
`?replay=<url>` para carregar um direto. Os replays ficam na pasta `Demos` do
jogo, ou no [ballchasing.com](https://ballchasing.com) (entre na conta para
baixar).

| Tecla | Faz |
|---|---|
| Espaço | Reproduz / pausa |
| ← → | Um quadro para trás / para a frente (pausa) |
| Shift ← → | Cinco segundos para trás / para a frente |
| 0 | Câmera livre (arraste para girar, role para dar zoom) |
| 9 | De cima |
| 1–6 | Segue um jogador com as configurações de câmera dele (ou clique nele no topo) |
| J | Jogar daqui com o jogador que você está seguindo |
| P, A, C | Caneta, seta, círculo (de novo para largar a ferramenta) |
| X | Apaga o desenho |
| Esc | Larga a ferramenta |

Os desenhos são do momento pausado: dar play apaga.

## Jogar daqui (experimental)

"Jogar daqui" (J) pega o carro do jogador que você está seguindo no momento
pausado e passa para você, no [RocketSim](https://github.com/ZealanL/RocketSim),
a física do Rocket League refeita por fora, no controle ou no teclado. Os outros
seguem o replay, e a bola também, até você tocar nela: dali em diante a jogada é
sua. R (Start no controle) tenta o mesmo momento de novo.

O marcador de um gol na linha do tempo abre o gol: veja desde 5 s antes,
defenda com alguém do time que tomou, ou marque de novo com alguém do time que
fez. Cada tentativa diz como foi ("Defendeu!", "Tomou o gol") e entra na
contagem.

Enquanto joga: a velocidade do jogo (100% até 25%), o início (parado até o seu
primeiro comando, ou com embalo de 2 s do replay), o fantasma do seu carro na
partida para comparar, boost infinito e os controles (qualquer botão ou tecla,
a zona morta do analógico, inclinação invertida; guardados no navegador).
`?play` é o free play: um carro, a bola, boost infinito.

## A prancheta

Uma prancheta tática no mesmo campo, sem replay: "Abrir a prancheta" na página
inicial, ou "Prancheta" enquanto assiste a um replay para montar todos os
carros, a bola, o boost de cada um e os boosts do campo como estavam.

- Arraste um carro ou a bola para mover; Shift e arraste para subir ou descer.
- A peça selecionada mostra alças, como num editor 3D: as setas movem numa
  direção (G; a verde é para cima) e, num carro, os anéis giram nos eixos dele
  (R; Q e E também giram). O painel define o nome, o time e o carro, e o boost
  num mostrador como o do jogo.
- Clique num boost do campo para marcá-lo como pego.
- O nome de um carro na barra (ou 1, 2, …) mostra o campo de trás dele, com
  ball cam ou câmera normal; um carro vindo de um replay mantém as
  configurações de câmera do jogador.
- Caneta, seta e círculo desenham no próprio campo, então ficam no lugar quando
  a câmera se move. Cmd/Ctrl-Z desfaz.
- A prancheta fica guardada no navegador e no link da página: "Copiar link"
  compartilha a montagem.

## O estúdio

Para comentar uma partida que você transmitiu: "Estúdio" no player, depois
"Adicionar a gravação…" (ou solte o vídeo na página). A gravação e o replay
rodam juntos; V troca qual dos dois ocupa a tela, e o outro fica no canto.

- **Vídeos comentados.** "Tela cheia", depois "Gravar um vídeo" troca o OBS para
  o perfil "Vídeo" (nunca durante a live), que grava a tela inteira com a câmera
  do Luan num canto; os controles saem da frente a não ser que o mouse esteja
  perto da parte de baixo, então as teclas (V, espaço, I/O, L, M) comandam.
  "Voltar ao OBS da live" põe o perfil da live de volta.
- **Shorts.** "Shorts" ao lado de um dia na lista de lives encontra as melhores
  jogadas do Luan naquele dia (gols, assistências e defesas, pontuados pelos
  eventos do dock da live e pelo que ele falou na transcrição) e abre a
  primeira, em loop. A imagem fica no canto superior esquerdo da tela, 1080×1056
  pixels de tela, para o perfil "Shorts" do OBS pôr sobre a câmera dele num
  short de 1080×1920; a lista e os controles ficam ao lado. "Gravar um short"
  troca o OBS para esse perfil (nunca durante a live) e cria um capítulo com o
  nome de cada jogada gravada.
- **Uma pasta de lives.** "Abrir uma pasta de lives…" na primeira página pega a
  pasta que o script de depois da live preenche (`Lives\<data>\<hh-mm-ss> Jogo.mp4`,
  só o jogo, ou `Live.mp4` nos dias de antes disso,
  e `Replays\Partida NN - <resultado>.replay`) e lista as partidas de cada dia;
  um clique abre a partida com o replay, a gravação do dia e o estúdio, e ‹ ›
  vão para as outras partidas do dia. Edge e Chrome lembram da pasta (um clique
  por visita para liberar a leitura de novo); nos outros, ela é escolhida a cada
  visita.
- **Alinhamento.** O replay não diz com precisão suficiente quando foi gravado,
  então o estúdio lê a sessão que o dock de partidas da live publicou (no
  [repositório do site](https://github.com/muanlartins/muanlartins/tree/main/content/matches)):
  quando a gravação começou e quando cada kickoff e cada gol aconteceu. Ele
  encontra a partida pelos kickoffs e gols e alinha cada trecho entre gols
  separadamente, já que o replay perde uns dois segundos a cada replay de gol
  que o jogo mostra. Sem sessão, o alinhamento é à mão; nos dois casos os botões
  de ±0,1 s e ±1 s ajustam, e o ajuste vale para a sessão inteira.
- **Uma jogada.** I e O marcam onde ela começa e termina, L repete.
- **Marcas.** M marca um momento (também enquanto o OBS grava: vira um capítulo
  na gravação, com MP4 híbrido). "Salvar marcas" baixa as marcas para a edição.
- **OBS.** "Conectar o OBS" (a senha fica em Ferramentas → Configurações do
  servidor WebSocket, e é guardada neste navegador) começa e para a gravação
  pela página.
- Os chutes, defesas e gols do streamer no dock aparecem como marquinhas
  amarelas na linha do tempo; o som da gravação tem alto, baixo e mudo.

## O que tem num replay

Um arquivo `.replay` é a gravação do próprio jogo do que o servidor mandou: a
posição, a rotação e a velocidade de cada carro e da bola umas 30 vezes por
segundo, além de boost, pulos, flips, demolições, gols e as configurações de
câmera de cada jogador. Ele não grava o controle, então os comandos do
analógico não são conhecidos (aceleração e direção são).
[subtr-actor](https://github.com/rlrml/subtr-actor) (feito sobre o
[boxcars](https://github.com/nickbabcock/boxcars)) lê o arquivo, num web
worker, e tudo o que aparece aqui vem dele.

## Créditos

- Modelos do Octane, do Fennec e da bola por [Jako](https://sketchfab.com/fairlight51),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):
  [Octane](https://sketchfab.com/3d-models/octane-rocket-league-car-9910f0a5d158425bbc7deb60c7a81f69),
  [Fennec](https://sketchfab.com/3d-models/fennec-rocket-league-car-5b43b50b6eeb4a12a29671df3418f57a),
  [bola](https://sketchfab.com/3d-models/ball-rocket-league-2c8911aa1dcd4c53bad842f2d354dfe2).
- Estádio: [Champions Field](https://sketchfab.com/3d-models/champions-field-rocket-league-stadium-6ea5ee0502ae432fbac3a4f8aaab61a5)
  por Prabhu Ram, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
  repintado, e com o campo trocado por um desenhado nas medidas do jogo.
- Leitura dos replays: [subtr-actor](https://github.com/rlrml/subtr-actor) e
  [boxcars](https://github.com/nickbabcock/boxcars) (MIT).
- Física do free play (`?play`): [RocketSim](https://github.com/ZealanL/RocketSim) por ZealanL (MIT), compilado
  para o navegador, com paredes da arena desenhadas por nós em vez das do jogo.
- Medidas do campo: os [useful game values](https://github.com/RLBot/wiki/blob/master/docs/v5/botmaking/useful-game-values.md) do RLBot.

Rocket League é uma marca registrada da Psyonix. Este é um projeto de fã, não
feito nem endossado pela Psyonix ou pela Epic Games.
