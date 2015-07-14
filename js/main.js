/*
 * Flow: geocodeAddresses -> geocodeAddress -> centerMap -> findDestinations -> plotDestinations -> getDistances -> getDistance -> plotDistance
 */
var middle = (function() {
    var MAX_DESTINATIONS = 3;

    var map, geocoder, service, directionsDisplay, lastWindow;

    var addresses, locations, locationMarkers, locationsDecoded;
    var destinations, destinationMarkers, destinationDistances, destinationInfoWindows;
    var destinationRoutes, destinationsMeasured, shortestAverage, shortestAverageIndex;

    function initialize() {
        var mapOptions = {
            center: {lat: 37.774929, lng: -122.419416},
            zoom: 8,
            mapTypeControl: false,
            zoomControl: true,
            overviewMapControl: false,
            scaleControl: false,
            streetViewControl: false
        };
        map = new google.maps.Map(document.getElementById('map'),
            mapOptions);
        geocoder = new google.maps.Geocoder();
    }
    google.maps.event.addDomListener(window, 'load', initialize);

    function geocodeAddresses() {
        console.log('geocodeAddresses');
        locations = [];
        locationMarkers = [];
        locationsDecoded = 0;

        for (var i = 0; i < addresses.length; i++) {
            geocodeAddress(i);
        }
    }

    function geocodeAddress(addressIndex) {
        console.log('geocodeAddresses(' + addressIndex + ')');
        geocoder.geocode({'address': addresses[addressIndex]}, function (results, status) {
            console.log('processing geocode for address ' + addressIndex);
            console.log(results);
            if (status == google.maps.GeocoderStatus.OK) {
                var marker = new google.maps.Marker({
                    map: map,
                    position: results[0].geometry.location,
                    icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
                    zIndex: 0
                });
                locationMarkers[addressIndex] = marker;

                var infowindow = new google.maps.InfoWindow({
                    content: results[0].formatted_address
                });

                google.maps.event.addListener(marker, 'click', function() {
                    if(lastWindow) {
                        lastWindow.close();
                    }
                    lastWindow = infowindow;
                    infowindow.open(map, marker);
                });

                locations[addressIndex] = results[0].geometry.location;
                locationsDecoded++;
                if (locationsDecoded === addresses.length) {
                    centerMap(locations);
                    findDestinations();
                }
            } else {
                showError('Couldn\'t find a location for ' + addresses[addressIndex]);
            }
        });
    }

    function centerMap(locations) {
        console.log('centerMap');
        console.log(locations);

        var bounds = new google.maps.LatLngBounds();
        for (var i = 0; i < locations.length; i++) {
            bounds.extend(locations[i]);
        }

        map.fitBounds(bounds);
    }

    function findDestinations() {
        console.log('findDestinations');
        var destination = $('#destination').val();

        service = new google.maps.places.PlacesService(map);
        var request = {
            location: map.getCenter(),
            radius: '50000',
            name: destination
        };

        service.nearbySearch(request, function(results, status) {
            if (status == google.maps.places.PlacesServiceStatus.OK) {
                destinations = results;
                plotDestinations(results);
            } else {
                showError('Couldn\'t find a destination for ' + destination);
            }
        });
    }

    function plotDestinations() {
        destinationMarkers = [];
        destinationDistances = [];
        destinationInfoWindows = [];
        destinationRoutes = [];
        destinationsMeasured = 0;
        shortestAverage = Number.MAX_VALUE;

        var bounds = map.getBounds();
        for(var i = 0; i < Math.min(destinations.length, MAX_DESTINATIONS); i++) {
            destinationMarkers[i] = new google.maps.Marker({
                map: map,
                position: destinations[i].geometry.location,
                icon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                zIndex: 1
            });

            bounds.extend(destinations[i].geometry.location);

            getDistances(i);
        }
        map.fitBounds(bounds);
    }

    function getDistances(destIndex) {
        console.log('getDistances(' + destIndex + ')');
        for(var i = 0; i < locations.length; i++) {
            getDistance(i, destIndex);
        }
    }

    function getDistance(locationIndex, destIndex) {
        console.log('getDistance(' + locationIndex + ',' + destIndex + ')');

        var modeSelection = $('#travelMode > .btn.active > input').attr('id');
        var travelMode = google.maps.TravelMode.WALKING;
        if(modeSelection === 'car') {
            var travelMode = google.maps.TravelMode.DRIVING;
        } else if(modeSelection === 'train') {
            var travelMode = google.maps.TravelMode.TRANSIT;
        }
        var directionsService = new google.maps.DirectionsService();

        var request = {
            origin: locations[locationIndex],
            destination: destinations[destIndex].geometry.location,
            provideRouteAlternatives: false,
            travelMode: travelMode
        };

        if(!destinationDistances[destIndex]) {
            destinationDistances[destIndex] = [];
        }
        if(!destinationRoutes[destIndex]) {
            destinationRoutes[destIndex] = [];
        }

        directionsService.route(request, function(result, status) {
            console.log('processing directions for getDistance(' + locationIndex + ',' + destIndex + ')');
            if (status == google.maps.DirectionsStatus.OK) {
                var distance = 0;
                for (var k = 0; k < result.routes[0].legs.length; k++) {
                    distance += result.routes[0].legs[k].distance.value;
                }

                destinationDistances[destIndex][locationIndex] = distance;
                destinationRoutes[destIndex][locationIndex] = result;
            } else {
                destinationDistances[destIndex][locationIndex] = 0;
            }

            for (k = 0; k < locations.length; k++) {
                if(destinationDistances[destIndex][k] === undefined) {
                    return;
                }
            }

            plotDistance(destIndex);
        });
    }

    function plotDistance(destIndex) {
        var contentString = '<h1>' + destinations[destIndex].name + '</h1>';
        contentString += '<p>' + destinations[destIndex].vicinity + '</p>';
        contentString += '<ul>';

        var sum = 0;
        var total = 0;
        for(var i = 0; i < locations.length; i++) {
            var distance = destinationDistances[destIndex][i];
            contentString += '<li>From ' + addresses[i] + ': ' + (distance > 0 ? distance + 'm' : 'Couldn\'t find route');
            if(distance > 0) {
                contentString += '<br/><a href="javascript:middle.showDirections(' + i + ', ' + destIndex + ')">Show directions</a>';
            }
            contentString += '</li>';
            sum += distance;
            total += distance > 0 ? 1 : 0;
        }
        var average = sum / total;

        var diffSquared = 0;
        for(i = 0; i < locations.length; i++) {
            distance = destinationDistances[destIndex][i];
            if(distance > 0) {
                diffSquared += Math.pow(average - distance, 2);
            }
        }

        contentString += '<li><b>Average: ' + average.toFixed(2) + 'm (&sigma;=' + Math.sqrt(diffSquared / total) + ')</b></li>';

        contentString += '</ul>';

        destinationInfoWindows[destIndex] = new google.maps.InfoWindow({
            content: contentString
        });

        google.maps.event.addListener(destinationMarkers[destIndex], 'click', function() {
            if(lastWindow) {
                lastWindow.close();
            }
            lastWindow = destinationInfoWindows[destIndex];
            destinationInfoWindows[destIndex].open(map, destinationMarkers[destIndex]);
        });

        if(average < shortestAverage) {
            shortestAverageIndex = destIndex;
            shortestAverage = average;
        }

        destinationsMeasured++;
        if(destinationsMeasured === Math.min(destinations.length, MAX_DESTINATIONS)) {
            if(lastWindow) {
                lastWindow.close();
            }
            lastWindow = destinationInfoWindows[shortestAverageIndex];
            destinationInfoWindows[shortestAverageIndex].open(map, destinationMarkers[shortestAverageIndex]);

            $('.wrapper').css('display', 'none');
            $('#reset').css('display', 'block');
        }
    }

    function search() {
        addresses = [];
        $('#locations > input').each(function() {
            var text = $(this).val();
            if (text) {
                addresses.push(text);
            }
        });

        if(addresses.length < 2) {
            showError('You must enter at least 2 places');
            return;
        }

        if(!$('#destination').val()) {
            showError('You must enter a place you want to meet at');
            return;
        }

        console.log(addresses);
        geocodeAddresses(addresses);
    }

    $('#form').submit(function(event) {
        search();
        event.preventDefault();
    });

    $('#search').click(function(event) {
        search();
        event.preventDefault();
    });

    $('#reset').click(function(event) {
        for(var i=0; i<locationMarkers.length; i++) {
            locationMarkers[i].setMap(null);
        }

        for(i=0; i<destinationMarkers.length; i++) {
            destinationMarkers[i].setMap(null);
        }

        if(directionsDisplay) {
            directionsDisplay.setMap(null);
            directionsDisplay = null;
        }

        $('.wrapper').css('display', 'block');
        $('#reset').css('display', 'none');
        event.preventDefault();
    });



    function showError(message) {
        $('#errorText').text(message);
        $('#errorModal').modal('show');
    }

    function showDirections(locationIndex, destIndex) {
        if(!directionsDisplay) {
            directionsDisplay = new google.maps.DirectionsRenderer({
                suppressMarkers: true,
                preserveViewport: true
            });
            directionsDisplay.setMap(map);
        }
        directionsDisplay.setDirections(destinationRoutes[destIndex][locationIndex]);
    }

    return {
        showDirections: showDirections
    };
})();