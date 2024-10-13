// src/GeoChart.js
import React, { useEffect } from 'react';

const GeoChart = ({ state }) => {
  useEffect(() => {
    // Load the Google Charts library
    const loadGoogleCharts = () => {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/charts/loader.js';
      script.async = true;
      script.onload = () => {
        // Load the GeoChart package
        window.google.charts.load('current', {
            packages: ['geochart'],
            mapsApiKey: 'AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY'
        });
        window.google.charts.setOnLoadCallback(drawRegionsMap);
      };
      document.body.appendChild(script);
    };

      const drawRegionsMap = () => {
        const stateFormatted = "US-" + state
      const data = window.google.visualization.arrayToDataTable([
        ['State', 'Popularity'], // Column headers
        [stateFormatted, 1] // Use the state abbreviation and a value (1 for highlighting)
      ]);

    const options = {
            region: 'US', // Set the region to the entire US
            resolution: "provinces",
            colorAxis: {
            colors: ['#e7f0f7', '#007bff'], // Gradient from light to dark blue
            },
            backgroundColor: '#f0f0f0', // Optional: Set background color
            datalessRegionColor: '#f8f8f8', // Color for regions without data
            defaultColor: '#f5f5f5', // Default color for regions
        legend: 'none',
        height: 100
        };


      const chart = new window.google.visualization.GeoChart(document.getElementById('regions_div'));
      chart.draw(data, options);
    };

    loadGoogleCharts();
  }, [state]);

  return <div id="regions_div" style={{ width: '150px', height: '150px' }} />;
};

export default GeoChart;