import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="ko" style={{background:'#06080d'}}>
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#06080d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="듀얼엔진" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <style>{`
          html, body, #__next {
            background: #06080d !important;
            margin: 0;
            padding: 0;
            width: 100%;
            overflow-x: hidden;
          }
        `}</style>
      </Head>
      <body style={{background:'#06080d',margin:0,padding:0}}>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
