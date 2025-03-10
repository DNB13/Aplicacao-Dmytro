import fetch from 'node-fetch';

// Função para fazer o upload de media via GraphQL para o Shopify
export async function uploadMedia(
  mediaUrl: string,
  productId: string,         // ID do produto (se necessário para associar a media)
  accessToken: string,       // Token de acesso à API do Shopify
  storeDomain: string        // Domínio da tua loja (ex.: "quickstart-5ccd09a9.myshopify.com")
): Promise<any> {
  // Define o endpoint da API GraphQL do Shopify (ajusta a versão conforme necessário)
  const endpoint = `https://${storeDomain}/admin/api/2023-04/graphql.json`;

  // A mutation para criar a media. Este exemplo assume o upload de uma imagem.
  const query = `
    mutation mediaCreate($media: [MediaInput!]!) {
      mediaCreate(media: $media) {
        media {
          ... on MediaImage {
            id
            image {
              originalSrc
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Define as variáveis para a mutation. Se o productId for necessário para associar a media, adapta conforme a documentação.
  const variables = {
    media: [{
      mediaContentType: "IMAGE",
      originalSource: mediaUrl,
      // Se necessário, inclui associações com o produto, de acordo com a documentação do Shopify.
      // Por exemplo: productId: productId
    }]
  };

  // Executa a chamada GraphQL
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  const result = await response.json();
  return result;
}