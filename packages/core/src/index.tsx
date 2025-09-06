import type { Context } from 'koishi'
import { h } from 'koishi'
import type TelegramBot from 'koishi-plugin-nekoil-adapter-telegram'
import type { SendStickerPayload } from 'koishi-plugin-nekoil-adapter-telegram'
import sharp from 'sharp'
import type { Config } from './config'

export * from './config'

export const name = 'stipic-core'

export const apply = (ctx: Context, _config: Config) => {
  const l = ctx.logger('stipic')

  const msgCtx = ctx.platform('telegram').private()

  msgCtx.command('start').action(() => HELP)
  msgCtx.command('help').action(() => HELP)

  msgCtx.middleware((session, next) =>
    next(async () => {
      let input

      try {
        input = parseInput(h.parse(session.content!))
      } catch (e) {
        if (e instanceof SkipError) return

        if (e instanceof InvalidTextError) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          ;(session.bot as unknown as TelegramBot).internal.sendMessage({
            chat_id: session.channelId!,
            text: '参数格式不太对，需要是「100w」「100h」或者「100w 100h」「100h 100w」这样子。',
          })

          return
        }

        l.error(e)
        return
      }

      if ((input.rw && input.rw > 512) || (input.rh && input.rh > 512)) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        ;(session.bot as unknown as TelegramBot).internal.sendMessage({
          chat_id: session.channelId!,
          text: '长和宽均不能超过 512。',
        })

        return
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ;(session.bot as unknown as TelegramBot).internal.sendChatAction({
        chat_id: session.channelId!,
        action: 'choose_sticker',
      })

      if (
        !(
          ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tiff'] satisfies (
            | string
            | undefined
          )[] as (string | undefined)[]
        ).includes(getExtFromUrl(input.src))
      ) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        ;(session.bot as unknown as TelegramBot).internal.sendMessage({
          chat_id: session.channelId!,
          text: '不支持的图片格式。请发送 jpg/png/webp 图片。',
        })

        return
      }

      let file

      try {
        file = await ctx.http.file(input.src)
      } catch (e) {
        l.error(`err getting file for chat ${session.channelId}`)
        l.error(e)

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        ;(session.bot as unknown as TelegramBot).internal.sendMessage({
          chat_id: session.channelId!,
          text: '获取图片时发生了错误，可能是图片太大了。',
        })

        return
      }

      // 大于 64M 的图片不处理
      if (file.data.byteLength > 67108864 /* 64M = 64*1024K = 64*1024*1024 */) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        ;(session.bot as unknown as TelegramBot).internal.sendMessage({
          chat_id: session.channelId!,
          text: '图片太大了，请尝试小一点的图片。',
        })

        return
      }

      const sharpImg = sharp(file.data)
      const { width, height } = await sharpImg.metadata()

      if (!input.rw && !input.rh && (width > 512 || height > 512)) {
        if (width > height) {
          input.rh = undefined
          input.rw = 512
        } else {
          input.rw = undefined
          input.rh = 512
        }
      }

      if (input.rw || input.rh) {
        sharpImg.resize({
          height: input.rh,
          width: input.rw,
          fit: input.rw && input.rh ? 'fill' : 'contain',
        })
      }

      const formData = new FormData()
      formData.append('chat_id', session.channelId!)
      formData.append('sticker', 'attach://i.webp')
      formData.append(
        'i.webp',
        new Blob([new Uint8Array(await sharpImg.webp().toBuffer()).buffer], {
          type: 'image/webp',
        }),
        'i.webp',
      )

      try {
        /* const sendStickerResult = */ await (
          session.bot as unknown as TelegramBot
        ).internal.sendSticker(formData as SendStickerPayload)
      } catch (e) {
        l.error(`err sending result for chat ${session.channelId}`)
        l.error(e)
      }
    }),
  )
}

const parseInput = (elements: h[]) => {
  let text: string | undefined = undefined
  let src: string

  switch (elements.length) {
    case 1: {
      if (!['file', 'img'].includes(elements[0]!.type)) throw new SkipError()

      src = elements[0]!.attrs['src'] as string

      break
    }

    case 2: {
      if (
        elements[0]!.type !== 'text' ||
        !['file', 'img'].includes(elements[1]!.type)
      )
        throw new SkipError()

      text = elements[0]!.attrs['content'] as string
      src = elements[1]!.attrs['src'] as string

      break
    }

    default:
      throw new SkipError()
  }

  const textPart = text?.trim().split(' ').filter(Boolean)

  let rw: number | undefined = undefined
  let rh: number | undefined = undefined

  if (textPart) {
    switch (textPart.length) {
      case 1: {
        switch (textPart[0]![textPart[0]!.length - 1]) {
          case 'w': {
            rw = Number(textPart[0]!.slice(0, textPart[0]!.length - 1))
            if (!rw) throw new InvalidTextError()
            break
          }
          case 'h': {
            rh = Number(textPart[0]!.slice(0, textPart[0]!.length - 1))
            if (!rh) throw new InvalidTextError()
            break
          }
          default:
            throw new InvalidTextError()
        }
        break
      }

      case 2: {
        switch (textPart[0]![textPart[0]!.length - 1]) {
          case 'w': {
            if (!textPart[1]!.endsWith('h')) throw new InvalidTextError()
            rw = Number(textPart[0]!.slice(0, textPart[0]!.length - 1))
            rh = Number(textPart[1]!.slice(0, textPart[1]!.length - 1))
            break
          }
          case 'h': {
            if (!textPart[1]!.endsWith('w')) throw new InvalidTextError()
            rh = Number(textPart[0]!.slice(0, textPart[0]!.length - 1))
            rw = Number(textPart[1]!.slice(0, textPart[1]!.length - 1))
            break
          }
          default:
            throw new InvalidTextError()
        }

        if (!rw) throw new InvalidTextError()
        if (!rh) throw new InvalidTextError()

        break
      }

      default:
        throw new InvalidTextError()
    }
  }

  return {
    rw,
    rh,
    src,
  }
}

export const getExtFromUrl = (url: string): string | undefined => {
  try {
    const lastSegment = new URL(url).pathname.split('/').pop()
    if (!lastSegment?.includes('.')) return undefined
    const ext = lastSegment.split('.').pop()?.trim().toLowerCase()
    if (!ext) return undefined
    return /^[a-z0-9]+$/i.exec(ext) ? ext : undefined
  } catch (_e) {
    return undefined
  }
}

class SkipError extends Error {}

class InvalidTextError extends Error {}

const HELP = (
  <>
    {
      '这个 bot 可以用来将图片转换为独立的 sticker。\n\n直接发送图片或者文字给我，我就会回复 sticker。\n\n发送的时候可以附带「'
    }
    <code>100w</code>
    {'」「'}
    <code>100h</code>
    {'」或者「'}
    <code>100w 100h</code>
    {'」「'}
    <code>100h 100w</code>
    {
      '」这样的文本，我会把 sticker 处理成对应宽或高的。\n（对应宽高的 sticker 在电脑端会显示成对应大小，手机端不行\n\n有建议或问题可以到 @ilharpe 反馈。'
    }
  </>
)
