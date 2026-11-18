/* Localização do usuário (Geolocation API). Exige HTTPS ou localhost e a permissão do usuário. */

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Seu navegador não oferece geolocalização.'));
    }

    const messages = {
      1: 'Permissão de localização negada.',
      2: 'Não foi possível determinar sua localização.',
      3: 'Tempo esgotado ao obter sua localização.'
    };

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy)
      }),
      err => reject(new Error(messages[err.code] || messages[2])),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}
